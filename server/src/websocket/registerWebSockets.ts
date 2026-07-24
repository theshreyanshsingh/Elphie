import type http from "node:http";
import { WebSocket, WebSocketServer } from "ws";
import {
  ensureRuntimeSession,
  handleRuntimeMediaEvent,
  runtimeSessionId,
  type RuntimeModality
} from "../services/workflow/runtime.js";
import { proxyCallSocket } from "./callProxy.js";

// Real-time call signaling drives the pipecat/aiortc voice pipeline, which only
// exists in the Python call-engine microservice. These routes are reverse-proxied
// there instead of being handled by the local relay below.
const PROXIED_ROUTES = new Set<string>([
  "webrtc_signaling",
  "public_webrtc_signaling"
]);

type WebSocketRoute = {
  name: string;
  pattern: RegExp;
};

type RoutedSocket = {
  ws: WebSocket;
  channel: string;
  route: string;
  connectedAt: number;
  workflowId: number | null;
  userId: number | null;
  workflowRunId: number | null;
};

const routes: WebSocketRoute[] = [
  {
    name: "webrtc_signaling",
    pattern: /^\/api\/v1\/ws\/signaling\/[^/]+\/[^/]+(?:\?.*)?$/
  },
  {
    name: "public_webrtc_signaling",
    pattern: /^\/api\/v1\/ws\/public\/signaling\/[^/]+(?:\?.*)?$/
  },
  {
    name: "ari",
    pattern: /^\/api\/v1\/telephony\/ws\/ari(?:\?.*)?$/
  },
  {
    name: "telephony_media",
    pattern: /^\/api\/v1\/telephony\/ws\/[^/]+\/[^/]+\/[^/]+(?:\?.*)?$/
  },
  {
    name: "agent_stream",
    pattern: /^\/api\/v1\/agent-stream\/[^/]+(?:\?.*)?$/
  }
];

const peersByChannel = new Map<string, Set<RoutedSocket>>();

export const resolveWebSocketRoute = (url: string): WebSocketRoute | null =>
  routes.find((candidate) => candidate.pattern.test(url)) ?? null;

const channelFor = (route: WebSocketRoute, url: string): string => {
  const pathname = new URL(url, "http://localhost").pathname;
  return `${route.name}:${pathname}`;
};

const numericPathParts = (url: string): number[] => {
  const pathname = new URL(url, "http://localhost").pathname;
  return pathname
    .split("/")
    .map((part) => Number(part))
    .filter((part) => Number.isFinite(part));
};

const modalityForRoute = (route: string): RuntimeModality => {
  if (route === "telephony_media" || route === "ari") return "telephony";
  if (route === "agent_stream") return "agent_stream";
  return "webrtc";
};

const runtimeForPeer = (peer: RoutedSocket) =>
  ensureRuntimeSession({
    id: runtimeSessionId({
      modality: modalityForRoute(peer.route),
      workflowRunId: peer.workflowRunId,
      channel: peer.channel
    }),
    modality: modalityForRoute(peer.route),
    workflowRunId: peer.workflowRunId,
    workflowId: peer.workflowId,
    userId: peer.userId,
    context: {
      websocket_route: peer.route,
      websocket_channel: peer.channel
    }
  });

const sendJson = (ws: WebSocket, payload: Record<string, unknown>): void => {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(payload));
  }
};

const addPeer = (peer: RoutedSocket): void => {
  const peers = peersByChannel.get(peer.channel) ?? new Set<RoutedSocket>();
  peers.add(peer);
  peersByChannel.set(peer.channel, peers);
};

const removePeer = (peer: RoutedSocket): void => {
  const peers = peersByChannel.get(peer.channel);
  if (!peers) {
    return;
  }
  peers.delete(peer);
  if (peers.size === 0) {
    peersByChannel.delete(peer.channel);
  }
};

const broadcast = (
  sender: RoutedSocket,
  payload: Record<string, unknown> | string | Buffer
): void => {
  const peers = peersByChannel.get(sender.channel);
  if (!peers) {
    return;
  }

  for (const peer of peers) {
    if (peer === sender || peer.ws.readyState !== WebSocket.OPEN) {
      continue;
    }
    if (typeof payload === "string" || Buffer.isBuffer(payload)) {
      peer.ws.send(payload);
    } else {
      sendJson(peer.ws, payload);
    }
  }
};

const forwardJson = (
  peer: RoutedSocket,
  message: Record<string, unknown>
): void => {
  broadcast(peer, {
    ...message,
    route: peer.route,
    channel: peer.channel,
    server_received_at: new Date().toISOString()
  });
};

const handleTelephonyMediaMessage = (
  peer: RoutedSocket,
  message: Record<string, unknown>
): void => {
  const event = String(message.event ?? message.type ?? "");
  if (event === "start" || event === "connected") {
    const runtimeEvent = handleRuntimeMediaEvent({
      session: runtimeForPeer(peer),
      type: "start",
      payload: message
    });
    sendJson(peer.ws, {
      event: "start_ack",
      route: peer.route,
      stream_sid: message.streamSid ?? message.stream_sid ?? null,
      runtime_session_id: runtimeForPeer(peer).id,
      runtime_event_id: runtimeEvent.id
    });
    return;
  }
  if (event === "media") {
    const runtimeEvent = handleRuntimeMediaEvent({
      session: runtimeForPeer(peer),
      type: "media",
      payload: {
        sequence_number: message.sequenceNumber ?? message.sequence_number ?? null,
        has_payload: Boolean(message.media ?? message.payload)
      }
    });
    sendJson(peer.ws, {
      event: "media_ack",
      route: peer.route,
      sequence_number: message.sequenceNumber ?? message.sequence_number ?? null,
      runtime_session_id: runtimeForPeer(peer).id,
      runtime_event_id: runtimeEvent.id
    });
    return;
  }
  if (event === "stop" || event === "disconnect") {
    const runtimeEvent = handleRuntimeMediaEvent({
      session: runtimeForPeer(peer),
      type: "stop",
      payload: message
    });
    sendJson(peer.ws, {
      event: "stop_ack",
      route: peer.route,
      runtime_session_id: runtimeForPeer(peer).id,
      runtime_event_id: runtimeEvent.id
    });
    peer.ws.close(1000, "media stream stopped");
    return;
  }
  forwardJson(peer, message);
};

const handleRouteMessage = (
  peer: RoutedSocket,
  message: Record<string, unknown>
): void => {
  if (peer.route === "telephony_media" || peer.route === "ari") {
    handleTelephonyMediaMessage(peer, message);
    return;
  }
  if (peer.route === "agent_stream") {
    const runtimeEvent = handleRuntimeMediaEvent({
      session: runtimeForPeer(peer),
      type: String(message.type ?? "agent_event"),
      payload: message
    });
    sendJson(peer.ws, {
      type: "agent_event_ack",
      runtime_session_id: runtimeForPeer(peer).id,
      runtime_event_id: runtimeEvent.id
    });
    forwardJson(peer, message);
    return;
  }
  handleRuntimeMediaEvent({
    session: runtimeForPeer(peer),
    type: String(message.type ?? "signal"),
    payload: message
  });
  forwardJson(peer, message);
};

export const registerWebSockets = (server: http.Server): void => {
  const wss = new WebSocketServer({ noServer: true });

  server.on("upgrade", (request, socket, head) => {
    const url = request.url ?? "";
    const route = routes.find((candidate) => candidate.pattern.test(url));

    if (!route) {
      socket.destroy();
      return;
    }

    wss.handleUpgrade(request, socket, head, (ws) => {
      if (PROXIED_ROUTES.has(route.name)) {
        proxyCallSocket(ws, url);
        return;
      }

      const pathNumbers = numericPathParts(url);
      const peer: RoutedSocket = {
        ws,
        route: route.name,
        channel: channelFor(route, url),
        connectedAt: Date.now(),
        workflowId: pathNumbers[0] ?? null,
        userId: route.name === "telephony_media" ? pathNumbers[1] ?? null : null,
        workflowRunId:
          route.name === "telephony_media"
            ? pathNumbers[2] ?? null
            : pathNumbers[1] ?? null
      };

      addPeer(peer);
      sendJson(ws, {
        type: "connected",
        route: route.name,
        channel: peer.channel,
        connected_at: peer.connectedAt
      });

      ws.on("message", (data) => {
        const text = data.toString();
        if (text === "ping") {
          sendJson(ws, { type: "pong" });
          return;
        }

        try {
          const message = JSON.parse(text) as Record<string, unknown>;
          if (message.type === "ping") {
            sendJson(ws, { type: "pong" });
            return;
          }
          handleRouteMessage(peer, message);
        } catch {
          broadcast(peer, data as Buffer);
        }
      });

      ws.on("close", () => removePeer(peer));
      ws.on("error", () => removePeer(peer));
    });
  });
};
