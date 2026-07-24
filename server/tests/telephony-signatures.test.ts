import crypto from "node:crypto";
import assert from "node:assert/strict";
import test from "node:test";
import {
  verifyPlivoSignature,
  verifyTelnyxSignature,
  verifyTwilioSignature,
  verifyVobizSignature
} from "../src/services/telephony/signatures.js";

const requestFor = (originalUrl: string) =>
  ({
    originalUrl
  }) as Parameters<typeof verifyTwilioSignature>[0]["req"];

test("Twilio signature verification matches signed sorted form params", () => {
  const authToken = "secret";
  const params = { CallSid: "CA123", CallStatus: "completed" };
  const signed =
    "http://localhost:8000/api/v1/telephony/twilio/status-callback/1" +
    "CallSidCA123" +
    "CallStatuscompleted";
  const signature = crypto
    .createHmac("sha1", authToken)
    .update(signed)
    .digest("base64");

  assert.equal(
    verifyTwilioSignature({
      req: requestFor("/api/v1/telephony/twilio/status-callback/1"),
      authToken,
      params,
      signature
    }),
    true
  );
});

test("Vobiz v3 signature verification uses nonce-separated payload", () => {
  const authToken = "secret";
  const baseUrl = "https://example.com/callback";
  const nonce = "nonce";
  const signature = crypto
    .createHmac("sha256", authToken)
    .update(`${baseUrl}.${nonce}`)
    .digest("base64");

  assert.equal(
    verifyVobizSignature({
      authToken,
      baseUrl,
      nonce,
      signature,
      version: "v3"
    }),
    true
  );
});

test("Plivo v3 signature verification signs URL, sorted params, and nonce", () => {
  const authToken = "secret";
  const nonce = "nonce";
  const params = { CallUUID: "call-1", CallStatus: "completed" };
  const payload =
    "http://localhost:8000/api/v1/telephony/plivo/hangup-callback/1" +
    "CallStatuscompleted" +
    "CallUUIDcall-1" +
    `.${nonce}`;
  const signature = crypto
    .createHmac("sha256", authToken)
    .update(payload)
    .digest("base64");

  assert.equal(
    verifyPlivoSignature({
      req: requestFor("/api/v1/telephony/plivo/hangup-callback/1"),
      authToken,
      params,
      signature,
      nonce
    }),
    true
  );
});

test("Telnyx signature verification validates Ed25519 timestamp payload", () => {
  const { publicKey, privateKey } = crypto.generateKeyPairSync("ed25519");
  const publicKeyDer = publicKey.export({ format: "der", type: "spki" });
  const webhookPublicKey = publicKeyDer.subarray(publicKeyDer.length - 32).toString("base64");
  const timestamp = "1700000000";
  const rawBody = Buffer.from(JSON.stringify({ data: { event_type: "call.hangup" } }));
  const signature = crypto
    .sign(null, Buffer.from(`${timestamp}|${rawBody.toString("utf8")}`), privateKey)
    .toString("base64");
  const req = {
    originalUrl: "/api/v1/telephony/telnyx/events/1",
    rawBody,
    body: JSON.parse(rawBody.toString("utf8"))
  } as Parameters<typeof verifyTelnyxSignature>[0]["req"];

  assert.equal(
    verifyTelnyxSignature({
      req,
      webhookPublicKey,
      signature,
      timestamp,
      nowSeconds: Number(timestamp)
    }),
    true
  );
});
