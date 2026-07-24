import assert from "node:assert/strict";
import test from "node:test";
import { createJwtToken, decodeJwtToken } from "../src/services/auth/token.js";

test("local auth token preserves FastAPI-compatible subject and email", () => {
  const token = createJwtToken(42, "user@example.com");
  const payload = decodeJwtToken(token);

  assert.equal(payload.sub, "42");
  assert.equal(payload.email, "user@example.com");
  assert.equal(typeof payload.exp, "number");
});
