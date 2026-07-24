import crypto from "node:crypto";
import { env } from "../../config/env.js";
import { HttpError } from "../../errors/httpError.js";
import type {
  TelephonyConfigurationRecord,
  TelephonyPhoneNumberRecord
} from "../../db/repositories/telephonyConfigurations.js";

export type OutboundCallRequest = {
  configuration: TelephonyConfigurationRecord;
  phoneNumbers: TelephonyPhoneNumberRecord[];
  to: string;
  workflowRunId: number;
  workflowId?: number | null;
  userId?: number | null;
};

export type OutboundCallResult = {
  status: "initiated";
  provider: string;
  provider_call_id: string;
  from_number: string | null;
  to_number: string;
  transport: "provider_http";
  raw_response?: unknown;
};

export class OutboundCallError extends HttpError {
  constructor(
    message: string,
    public statusCode = 502
  ) {
    super(statusCode, message);
  }
}

const objectOrEmpty = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};

const requiredString = (
  credentials: Record<string, unknown>,
  key: string
): string => {
  const value = credentials[key];
  if (typeof value !== "string" || !value.trim()) {
    throw new OutboundCallError(`Missing telephony credential: ${key}`, 400);
  }
  return value.trim();
};

const backendUrl = (path: string): string =>
  `${env.backendApiEndpoint.replace(/\/+$/, "")}${path}`;

const websocketBackendUrl = (path: string): string =>
  backendUrl(path).replace(/^http:\/\//, "ws://").replace(/^https:\/\//, "wss://");

const basicAuth = (user: string, password: string): string =>
  `Basic ${Buffer.from(`${user}:${password}`).toString("base64")}`;

const jsonOrText = async (response: Response): Promise<unknown> => {
  const text = await response.text();
  if (!text) return {};
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return { text };
  }
};

const assertOk = async (
  response: Response,
  provider: string
): Promise<unknown> => {
  const body = await jsonOrText(response);
  if (!response.ok) {
    throw new OutboundCallError(
      `${provider} call initiation failed with HTTP ${response.status}: ${JSON.stringify(body)}`,
      response.status
    );
  }
  return body;
};

const valueAt = (value: unknown, path: string[]): string | null => {
  let current = value;
  for (const segment of path) {
    if (!current || typeof current !== "object" || !(segment in current)) {
      return null;
    }
    current = (current as Record<string, unknown>)[segment];
  }
  return current == null ? null : String(current);
};

const result = (
  input: OutboundCallRequest,
  providerCallId: string,
  fromNumber: string | null,
  rawResponse: unknown
): OutboundCallResult => ({
  status: "initiated",
  provider: input.configuration.provider,
  provider_call_id: providerCallId,
  from_number: fromNumber,
  to_number: input.to,
  transport: "provider_http",
  raw_response: rawResponse
});

export const selectOutboundCallerId = (
  phoneNumbers: TelephonyPhoneNumberRecord[]
): string | null => {
  const active = phoneNumbers.filter((phoneNumber) => phoneNumber.is_active);
  return (
    active.find((phoneNumber) => phoneNumber.is_default_caller_id)?.address ??
    active[0]?.address ??
    null
  );
};

const requireFromNumber = (input: OutboundCallRequest): string => {
  const from = selectOutboundCallerId(input.phoneNumbers);
  if (!from) {
    throw new OutboundCallError(
      `No active outbound caller ID configured for ${input.configuration.provider}`,
      400
    );
  }
  return from;
};

const streamPath = (input: OutboundCallRequest): string => {
  if (!input.workflowId || !input.userId) {
    return `/api/v1/telephony/ws/${input.configuration.provider}/0/${input.workflowRunId}`;
  }
  return `/api/v1/telephony/ws/${input.workflowId}/${input.userId}/${input.workflowRunId}`;
};

const twimlUrl = (input: OutboundCallRequest): string =>
  backendUrl(`/api/v1/telephony/inbound/run?workflow_run_id=${input.workflowRunId}`);

const initiateTwilio = async (
  input: OutboundCallRequest,
  credentials: Record<string, unknown>
): Promise<OutboundCallResult> => {
  const accountSid = requiredString(credentials, "account_sid");
  const authToken = requiredString(credentials, "auth_token");
  const from = requireFromNumber(input);
  const body = new URLSearchParams({
    To: input.to,
    From: from,
    Url: twimlUrl(input),
    Method: "POST",
    StatusCallback: backendUrl(
      `/api/v1/telephony/twilio/status-callback/${input.workflowRunId}`
    ),
    StatusCallbackMethod: "POST"
  });
  const response = await fetch(
    `https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(accountSid)}/Calls.json`,
    {
      method: "POST",
      headers: {
        Authorization: basicAuth(accountSid, authToken),
        "Content-Type": "application/x-www-form-urlencoded"
      },
      body
    }
  );
  const raw = await assertOk(response, "Twilio");
  const callId = valueAt(raw, ["sid"]);
  if (!callId) throw new OutboundCallError("Twilio response did not include sid");
  return result(input, callId, from, raw);
};

const initiatePlivo = async (
  input: OutboundCallRequest,
  credentials: Record<string, unknown>,
  options: { vobiz?: boolean } = {}
): Promise<OutboundCallResult> => {
  const authId = requiredString(credentials, "auth_id");
  const authToken = requiredString(credentials, "auth_token");
  const from = requireFromNumber(input);
  const endpoint = options.vobiz
    ? `https://api.vobiz.ai/api/v1/Account/${encodeURIComponent(authId)}/Call/`
    : `https://api.plivo.com/v1/Account/${encodeURIComponent(authId)}/Call/`;
  const providerName = options.vobiz ? "Vobiz" : "Plivo";
  const clean = options.vobiz
    ? { from: from.replace(/^\+/, ""), to: input.to.replace(/^\+/, "") }
    : { from, to: input.to };
  const payload = {
    ...clean,
    answer_url: twimlUrl(input),
    answer_method: "POST",
    hangup_url: backendUrl(
      `/api/v1/telephony/${options.vobiz ? "vobiz" : "plivo"}/hangup-callback/${input.workflowRunId}`
    ),
    hangup_method: "POST",
    ring_url: backendUrl(
      `/api/v1/telephony/${options.vobiz ? "vobiz" : "plivo"}/ring-callback/${input.workflowRunId}`
    ),
    ring_method: "POST"
  };
  const response = await fetch(endpoint, {
    method: "POST",
    headers: options.vobiz
      ? {
          "X-Auth-ID": authId,
          "X-Auth-Token": authToken,
          "Content-Type": "application/json"
        }
      : {
          Authorization: basicAuth(authId, authToken),
          "Content-Type": "application/json"
        },
    body: JSON.stringify(payload)
  });
  const raw = await assertOk(response, providerName);
  const callId =
    valueAt(raw, ["request_uuid"]) ??
    valueAt(raw, ["message_uuid"]) ??
    valueAt(raw, ["call_uuid"]) ??
    valueAt(raw, ["CallUUID"]) ??
    valueAt(raw, ["RequestUUID"]);
  if (!callId) throw new OutboundCallError(`${providerName} response did not include a call id`);
  return result(input, callId, from, raw);
};

const initiateTelnyx = async (
  input: OutboundCallRequest,
  credentials: Record<string, unknown>
): Promise<OutboundCallResult> => {
  const apiKey = requiredString(credentials, "api_key");
  const connectionId = requiredString(credentials, "connection_id");
  const from = requireFromNumber(input);
  const response = await fetch("https://api.telnyx.com/v2/calls", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      connection_id: connectionId,
      to: input.to,
      from,
      webhook_url: backendUrl(
        `/api/v1/telephony/telnyx/events/${input.workflowRunId}`
      )
    })
  });
  const raw = await assertOk(response, "Telnyx");
  const callId =
    valueAt(raw, ["data", "call_control_id"]) ??
    valueAt(raw, ["data", "call_session_id"]);
  if (!callId) throw new OutboundCallError("Telnyx response did not include a call id");
  return result(input, callId, from, raw);
};

const base64Url = (value: Buffer | string): string =>
  Buffer.from(value).toString("base64url");

const vonageJwt = (credentials: Record<string, unknown>): string => {
  const applicationId = requiredString(credentials, "application_id");
  const privateKey = requiredString(credentials, "private_key").replace(/\\n/g, "\n");
  const now = Math.floor(Date.now() / 1000);
  const payload = {
    application_id: applicationId,
    iat: now,
    exp: now + 60,
    jti: crypto.randomUUID()
  };
  const signingInput = `${base64Url(JSON.stringify({ alg: "RS256", typ: "JWT" }))}.${base64Url(JSON.stringify(payload))}`;
  const signer = crypto.createSign("RSA-SHA256");
  signer.update(signingInput);
  signer.end();
  return `${signingInput}.${signer.sign(privateKey).toString("base64url")}`;
};

const initiateVonage = async (
  input: OutboundCallRequest,
  credentials: Record<string, unknown>
): Promise<OutboundCallResult> => {
  const from = requireFromNumber(input).replace(/^\+/, "");
  const response = await fetch("https://api.nexmo.com/v1/calls", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${vonageJwt(credentials)}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      to: [{ type: "phone", number: input.to.replace(/^\+/, "") }],
      from: { type: "phone", number: from },
      answer_url: [twimlUrl(input)],
      event_url: [
        backendUrl(`/api/v1/telephony/vonage/events/${input.workflowRunId}`)
      ]
    })
  });
  const raw = await assertOk(response, "Vonage");
  const callId = valueAt(raw, ["uuid"]);
  if (!callId) throw new OutboundCallError("Vonage response did not include uuid");
  return result(input, callId, from, raw);
};

const initiateCloudonix = async (
  input: OutboundCallRequest,
  credentials: Record<string, unknown>
): Promise<OutboundCallResult> => {
  const bearerToken = requiredString(credentials, "bearer_token");
  const domainId = requiredString(credentials, "domain_id");
  const from = requireFromNumber(input);
  const normalizedDomain = domainId.endsWith(".cloudonix.net")
    ? domainId
    : `${domainId}.cloudonix.net`;
  const response = await fetch(
    `https://api.cloudonix.io/calls/${encodeURIComponent(normalizedDomain)}/application`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${bearerToken}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        destination: input.to,
        "caller-id": from,
        cxml: `<?xml version="1.0" encoding="UTF-8"?><Response><Connect><Stream url="${websocketBackendUrl(streamPath(input))}"></Stream></Connect><Pause length="40"/></Response>`
      })
    }
  );
  const raw = await assertOk(response, "Cloudonix");
  const callId = valueAt(raw, ["token"]);
  if (!callId) throw new OutboundCallError("Cloudonix response did not include token");
  return result(input, callId, from, raw);
};

const initiateAri = async (
  input: OutboundCallRequest,
  credentials: Record<string, unknown>
): Promise<OutboundCallResult> => {
  const ariEndpoint = requiredString(credentials, "ari_endpoint").replace(/\/+$/, "");
  const appName = requiredString(credentials, "app_name");
  const appPassword = requiredString(credentials, "app_password");
  const from = selectOutboundCallerId(input.phoneNumbers);
  const endpoint = input.to.includes("/")
    ? input.to
    : `PJSIP/${input.to.replace(/^sip:/i, "")}`;
  const params = new URLSearchParams({
    endpoint,
    app: appName,
    appArgs: String(input.workflowRunId),
    ...(from ? { callerId: from } : {})
  });
  const response = await fetch(`${ariEndpoint}/ari/channels?${params.toString()}`, {
    method: "POST",
    headers: {
      Authorization: basicAuth(appName, appPassword)
    }
  });
  const raw = await assertOk(response, "ARI");
  const callId = valueAt(raw, ["id"]);
  if (!callId) throw new OutboundCallError("ARI response did not include channel id");
  return result(input, callId, from, raw);
};

export const initiateOutboundCall = async (
  input: OutboundCallRequest
): Promise<OutboundCallResult> => {
  const credentials = objectOrEmpty(input.configuration.credentials);
  switch (input.configuration.provider) {
    case "twilio":
      return await initiateTwilio(input, credentials);
    case "plivo":
      return await initiatePlivo(input, credentials);
    case "vobiz":
      return await initiatePlivo(input, credentials, { vobiz: true });
    case "telnyx":
      return await initiateTelnyx(input, credentials);
    case "vonage":
      return await initiateVonage(input, credentials);
    case "cloudonix":
      return await initiateCloudonix(input, credentials);
    case "ari":
      return await initiateAri(input, credentials);
    default:
      throw new OutboundCallError(
        `Unsupported telephony provider: ${input.configuration.provider}`,
        400
      );
  }
};
