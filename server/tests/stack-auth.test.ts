import assert from "node:assert/strict";
import test from "node:test";
import { HttpError } from "../src/errors/httpError.js";
import {
  impersonateStackUser,
  stripBearerToken
} from "../src/services/auth/stackAuth.js";

test("Stack Auth token helper strips Bearer prefix like Python", () => {
  assert.equal(stripBearerToken("Bearer access-token"), "access-token");
  assert.equal(stripBearerToken("access-token"), "access-token");
  assert.equal(stripBearerToken(undefined), null);
});

test("Stack impersonation fails clearly when Stack Auth is not configured", async () => {
  await assert.rejects(
    () => impersonateStackUser("user_123"),
    (err) => err instanceof HttpError && err.status === 500
  );
});
