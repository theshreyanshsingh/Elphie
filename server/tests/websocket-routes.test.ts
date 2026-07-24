import assert from "node:assert/strict";
import test from "node:test";
import { resolveWebSocketRoute } from "../src/websocket/registerWebSockets.js";

test("WebSocket route matcher preserves FastAPI public paths", () => {
  assert.equal(
    resolveWebSocketRoute("/api/v1/ws/signaling/12/34")?.name,
    "webrtc_signaling"
  );
  assert.equal(
    resolveWebSocketRoute("/api/v1/ws/public/signaling/session-token")?.name,
    "public_webrtc_signaling"
  );
  assert.equal(
    resolveWebSocketRoute("/api/v1/telephony/ws/1/2/3")?.name,
    "telephony_media"
  );
  assert.equal(
    resolveWebSocketRoute("/api/v1/agent-stream/workflow-uuid")?.name,
    "agent_stream"
  );
  assert.equal(resolveWebSocketRoute("/api/v1/nope"), null);
});
