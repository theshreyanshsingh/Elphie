import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import test from "node:test";
import httpMocks from "node-mocks-http";
import { createApp } from "../src/app.js";

const request = async (
  method: "GET" | "POST",
  url: string
): Promise<{ statusCode: number; body: Record<string, unknown> }> => {
  const app = createApp();
  const req = httpMocks.createRequest({ method, url });
  const res = httpMocks.createResponse({ eventEmitter: EventEmitter });

  await new Promise<void>((resolve, reject) => {
    res.on("end", resolve);
    res.on("error", reject);
    app(req, res);
  });

  const data = res._getData();
  return {
    statusCode: res._getStatusCode(),
    body: data ? (JSON.parse(data) as Record<string, unknown>) : {}
  };
};

test("health endpoint matches FastAPI response shape", async () => {
  const response = await request("GET", "/api/v1/health");
  assert.equal(response.statusCode, 200);
  assert.deepEqual(Object.keys(response.body as Record<string, unknown>).sort(), [
    "auth_provider",
    "backend_api_endpoint",
    "deployment_mode",
    "force_turn_relay",
    "stack_project_id",
    "stack_publishable_client_key",
    "status",
    "turn_enabled",
    "version"
  ]);
});

test("explicit protected workflow routes require authentication", async () => {
  const response = await request("GET", "/api/v1/workflow/count");
  assert.equal(response.statusCode, 401);
  assert.equal(
    (response.body as Record<string, unknown>).detail,
    "Authorization header required"
  );
});
