import { type RawData, WebSocket } from "ws";
import { env } from "../config/env.js";
import { logger } from "../logging/logger.js";

/**
 * Express cannot run the WebRTC voice pipeline (pipecat / aiortc lives in the
 * Python service). For real-time call signaling we therefore act as a thin
 * frame-level reverse proxy: the browser keeps talking to this Express server,
 * and every WebSocket frame is relayed to/from the Python call-engine
 * microservice (CALL_SERVICE_URL). Auth works transparently because the token
 * is carried in the query string and both services share OSS_JWT_SECRET.
 */

// WebSocket close codes must be in the valid range for `close(code)`.
// 1005/1006 (and anything outside 1000-4999) are reserved and would throw.
const safeCloseCode = (code: number): number =>
  code >= 1000 && code <= 4999 && code !== 1005 && code !== 1006 ? code : 1000;

export const proxyCallSocket = (client: WebSocket, requestUrl: string): void => {
  const upstreamUrl = `${env.callServiceUrl}${requestUrl}`;
  const upstream = new WebSocket(upstreamUrl);

  const pendingFromClient: Array<{ data: RawData; isBinary: boolean }> = [];

  upstream.on("open", () => {
    for (const frame of pendingFromClient) {
      upstream.send(frame.data, { binary: frame.isBinary });
    }
    pendingFromClient.length = 0;
  });

  upstream.on("message", (data: RawData, isBinary: boolean) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(data, { binary: isBinary });
    }
  });

  upstream.on("close", (code: number, reason: Buffer) => {
    if (
      client.readyState === WebSocket.OPEN ||
      client.readyState === WebSocket.CONNECTING
    ) {
      client.close(safeCloseCode(code), reason.toString());
    }
  });

  upstream.on("error", (err) => {
    logger.error({ err, upstreamUrl }, "call proxy upstream error");
    if (client.readyState === WebSocket.OPEN) {
      client.close(1011, "call service unavailable");
    }
  });

  client.on("message", (data: RawData, isBinary: boolean) => {
    if (upstream.readyState === WebSocket.OPEN) {
      upstream.send(data, { binary: isBinary });
    } else {
      pendingFromClient.push({ data, isBinary });
    }
  });

  client.on("close", (code: number, reason: Buffer) => {
    if (
      upstream.readyState === WebSocket.OPEN ||
      upstream.readyState === WebSocket.CONNECTING
    ) {
      upstream.close(safeCloseCode(code), reason.toString());
    }
  });

  client.on("error", () => {
    if (
      upstream.readyState === WebSocket.OPEN ||
      upstream.readyState === WebSocket.CONNECTING
    ) {
      upstream.close(1011);
    }
  });
};
