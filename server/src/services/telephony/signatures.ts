import crypto from "node:crypto";
import type { Request } from "express";
import { env } from "../../config/env.js";

const TELNYX_TIMESTAMP_TOLERANCE_SECONDS = 300;
const ED25519_SPKI_PREFIX = Buffer.from("302a300506032b6570032100", "hex");

const timingSafeEqual = (left: string, right: string): boolean => {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  if (leftBuffer.length !== rightBuffer.length) return false;
  return crypto.timingSafeEqual(leftBuffer, rightBuffer);
};

const publicRequestUrl = (req: Request): string => {
  const configured = env.backendApiEndpoint.replace(/\/+$/, "");
  return `${configured}${req.originalUrl}`;
};

export const verifyTwilioSignature = (input: {
  req: Request;
  authToken: string;
  params: Record<string, unknown>;
  signature: string | undefined;
}): boolean => {
  if (!input.signature || !input.authToken) return false;
  const sorted = Object.keys(input.params).sort();
  const signed = sorted.reduce(
    (acc, key) => `${acc}${key}${String(input.params[key] ?? "")}`,
    publicRequestUrl(input.req)
  );
  const expected = crypto
    .createHmac("sha1", input.authToken)
    .update(signed)
    .digest("base64");
  return timingSafeEqual(expected, input.signature);
};

export const verifyVobizSignature = (input: {
  authToken: string;
  baseUrl: string;
  nonce: string | undefined;
  signature: string | undefined;
  version: "v2" | "v3";
}): boolean => {
  if (!input.signature || !input.nonce || !input.authToken) return false;
  const payload =
    input.version === "v3"
      ? `${input.baseUrl}.${input.nonce}`
      : `${input.baseUrl}${input.nonce}`;
  const expected = crypto
    .createHmac("sha256", input.authToken)
    .update(payload)
    .digest("base64");
  return timingSafeEqual(expected, input.signature);
};

const rawBodyText = (req: Request): string =>
  req.rawBody ? req.rawBody.toString("utf8") : JSON.stringify(req.body ?? {});

export const verifyTelnyxSignature = (input: {
  req: Request;
  webhookPublicKey: string;
  signature: string | undefined;
  timestamp: string | undefined;
  nowSeconds?: number;
}): boolean => {
  if (!input.signature || !input.timestamp || !input.webhookPublicKey) {
    return false;
  }
  const timestamp = Number(input.timestamp);
  if (!Number.isFinite(timestamp)) return false;
  const nowSeconds = input.nowSeconds ?? Math.floor(Date.now() / 1000);
  if (Math.abs(nowSeconds - timestamp) > TELNYX_TIMESTAMP_TOLERANCE_SECONDS) {
    return false;
  }

  let publicKeyBytes: Buffer;
  let signatureBytes: Buffer;
  try {
    publicKeyBytes = Buffer.from(input.webhookPublicKey.trim(), "base64");
    signatureBytes = Buffer.from(input.signature.trim(), "base64");
  } catch {
    return false;
  }
  if (publicKeyBytes.length !== 32 || signatureBytes.length !== 64) {
    return false;
  }

  const publicKey = crypto.createPublicKey({
    key: Buffer.concat([ED25519_SPKI_PREFIX, publicKeyBytes]),
    format: "der",
    type: "spki"
  });
  return crypto.verify(
    null,
    Buffer.from(`${input.timestamp}|${rawBodyText(input.req)}`, "utf8"),
    publicKey,
    signatureBytes
  );
};

const sortedParamsString = (params: Record<string, unknown>): string =>
  Object.keys(params)
    .sort()
    .map((key) => `${key}${String(params[key] ?? "")}`)
    .join("");

export const verifyPlivoSignature = (input: {
  req: Request;
  authToken: string;
  params: Record<string, unknown>;
  signature: string | undefined;
  nonce: string | undefined;
}): boolean => {
  if (!input.signature || !input.nonce || !input.authToken) return false;
  const payload = `${publicRequestUrl(input.req)}${sortedParamsString(input.params)}.${input.nonce}`;
  const expected = crypto
    .createHmac("sha256", input.authToken)
    .update(payload)
    .digest("base64");
  return input.signature
    .split(",")
    .map((candidate) => candidate.trim())
    .filter(Boolean)
    .some((candidate) => timingSafeEqual(expected, candidate));
};

export const verifyCloudonixApiKey = (input: {
  expectedApiKey: string;
  providedApiKey: string | undefined;
}): boolean =>
  Boolean(input.expectedApiKey && input.providedApiKey) &&
  timingSafeEqual(input.expectedApiKey, input.providedApiKey ?? "");
