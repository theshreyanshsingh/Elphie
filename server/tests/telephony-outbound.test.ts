import assert from "node:assert/strict";
import test from "node:test";
import {
  initiateOutboundCall,
  OutboundCallError,
  selectOutboundCallerId
} from "../src/services/telephony/outbound.js";
import type {
  TelephonyConfigurationRecord,
  TelephonyPhoneNumberRecord
} from "../src/db/repositories/telephonyConfigurations.js";

const config = (
  provider: string,
  credentials: Record<string, unknown>
): TelephonyConfigurationRecord => ({
  id: 7,
  organization_id: 42,
  name: "Default",
  provider,
  credentials,
  is_default_outbound: true,
  created_at: new Date(),
  updated_at: null
});

const phone = (
  address: string,
  overrides: Partial<TelephonyPhoneNumberRecord> = {}
): TelephonyPhoneNumberRecord => ({
  id: 1,
  organization_id: 42,
  telephony_configuration_id: 7,
  address,
  address_normalized: address,
  address_type: "pstn",
  country_code: null,
  label: null,
  inbound_workflow_id: null,
  is_active: true,
  is_default_caller_id: false,
  extra_metadata: {},
  created_at: new Date(),
  updated_at: null,
  ...overrides
});

test("outbound caller ID prefers active default phone number", () => {
  assert.equal(
    selectOutboundCallerId([
      phone("+15550000001"),
      phone("+15550000002", { is_default_caller_id: true })
    ]),
    "+15550000002"
  );
});

test("Twilio outbound initiation performs provider HTTP request", async () => {
  const originalFetch = globalThis.fetch;
  let requestUrl = "";
  let requestBody = "";
  globalThis.fetch = (async (url, init) => {
    requestUrl = String(url);
    requestBody = String(init?.body);
    return new Response(JSON.stringify({ sid: "CA123" }), { status: 201 });
  }) as typeof fetch;

  try {
    const result = await initiateOutboundCall({
      configuration: config("twilio", {
        account_sid: "AC123",
        auth_token: "secret"
      }),
      phoneNumbers: [phone("+15550000001", { is_default_caller_id: true })],
      to: "+15559990000",
      workflowRunId: 99,
      workflowId: 12,
      userId: 34
    });

    assert.equal(result.provider_call_id, "CA123");
    assert.equal(result.from_number, "+15550000001");
    assert.match(requestUrl, /api\.twilio\.com\/2010-04-01\/Accounts\/AC123\/Calls\.json/);
    assert.match(requestBody, /To=%2B15559990000/);
    assert.match(requestBody, /StatusCallback=/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("Telnyx outbound initiation sends Call Control payload", async () => {
  const originalFetch = globalThis.fetch;
  let payload: Record<string, unknown> = {};
  globalThis.fetch = (async (_url, init) => {
    payload = JSON.parse(String(init?.body)) as Record<string, unknown>;
    return new Response(
      JSON.stringify({ data: { call_control_id: "telnyx-call-1" } }),
      { status: 200 }
    );
  }) as typeof fetch;

  try {
    const result = await initiateOutboundCall({
      configuration: config("telnyx", {
        api_key: "key",
        connection_id: "conn"
      }),
      phoneNumbers: [phone("+15550000001", { is_default_caller_id: true })],
      to: "+15559990000",
      workflowRunId: 100
    });

    assert.equal(result.provider_call_id, "telnyx-call-1");
    assert.equal(payload.connection_id, "conn");
    assert.equal(payload.from, "+15550000001");
    assert.equal(payload.to, "+15559990000");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("outbound initiation fails clearly without active caller ID", async () => {
  await assert.rejects(
    initiateOutboundCall({
      configuration: config("twilio", {
        account_sid: "AC123",
        auth_token: "secret"
      }),
      phoneNumbers: [],
      to: "+15559990000",
      workflowRunId: 99
    }),
    OutboundCallError
  );
});
