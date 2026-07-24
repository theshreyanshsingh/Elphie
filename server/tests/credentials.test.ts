import assert from "node:assert/strict";
import test from "node:test";
import { HttpError } from "../src/errors/httpError.js";
import { validateCredentialData } from "../src/routes/credentials.js";

test("credential data validation matches Python route requirements", () => {
  assert.doesNotThrow(() =>
    validateCredentialData("api_key", {
      header_name: "X-API-Key",
      api_key: "secret"
    })
  );
  assert.doesNotThrow(() =>
    validateCredentialData("basic_auth", {
      username: "user",
      password: "pass"
    })
  );
  assert.throws(
    () => validateCredentialData("bearer_token", {}),
    (err) => err instanceof HttpError && err.status === 400
  );
});
