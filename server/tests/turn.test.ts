import assert from "node:assert/strict";
import crypto from "node:crypto";
import test from "node:test";
import { generateTurnCredentials } from "../src/services/turn/credentials.js";

test("TURN credentials follow coturn REST API HMAC format", () => {
  const credentials = generateTurnCredentials("123", 60);
  const expectedPassword = crypto
    .createHmac("sha1", process.env.TURN_SECRET ?? "dograh-turn-secret-change-in-production")
    .update(credentials.username)
    .digest("base64");

  assert.match(credentials.username, /^\d+:123$/);
  assert.equal(credentials.password, expectedPassword);
  assert.equal(credentials.ttl, 60);
  assert.ok(credentials.uris.some((uri) => uri.startsWith("turn:")));
});
