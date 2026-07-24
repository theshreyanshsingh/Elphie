import assert from "node:assert/strict";
import crypto from "node:crypto";
import test from "node:test";
import { generateApiKey } from "../src/db/repositories/apiKeys.js";
import { hashApiKey } from "../src/services/auth/apiKey.js";

test("API key hashing matches Python sha256 behavior", () => {
  const raw = "dgr_example_key";
  const expected = crypto.createHash("sha256").update(raw).digest("hex");
  assert.equal(hashApiKey(raw), expected);
});

test("generated API keys preserve Dograh prefix contract", () => {
  const generated = generateApiKey();
  assert.match(generated.rawApiKey, /^dgr_/);
  assert.equal(generated.keyPrefix, generated.rawApiKey.slice(0, 8));
  assert.equal(hashApiKey(generated.rawApiKey), generated.keyHash);
});
