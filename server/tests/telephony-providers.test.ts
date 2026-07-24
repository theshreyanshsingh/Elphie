import assert from "node:assert/strict";
import test from "node:test";
import { registerTelephonyProviders } from "../src/services/telephony/providers/index.js";
import { allProviders } from "../src/services/telephony/registry.js";

test("telephony provider registry exposes Python-equivalent credential metadata", () => {
  registerTelephonyProviders();
  const providers = new Map(allProviders().map((provider) => [provider.name, provider]));

  assert.deepEqual([...providers.keys()].sort(), [
    "ari",
    "cloudonix",
    "plivo",
    "telnyx",
    "twilio",
    "vobiz",
    "vonage"
  ]);

  assert.equal(providers.get("twilio")?.accountIdCredentialField, "account_sid");
  assert.ok(
    providers
      .get("twilio")
      ?.uiMetadata?.fields.some((field) => field.name === "auth_token" && field.sensitive)
  );
  assert.ok(
    providers
      .get("telnyx")
      ?.uiMetadata?.fields.some((field) => field.name === "webhook_public_key" && field.required)
  );
  assert.ok(
    providers
      .get("vonage")
      ?.uiMetadata?.fields.some((field) => field.name === "private_key" && field.type === "textarea")
  );
  assert.ok(
    providers
      .get("ari")
      ?.uiMetadata?.fields.some((field) => field.name === "ari_endpoint")
  );
});
