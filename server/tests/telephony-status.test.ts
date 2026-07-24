import assert from "node:assert/strict";
import test from "node:test";
import {
  buildTwilioTransferResult,
  callIdFromWebhook,
  providerFromWebhook,
  telephonyXmlResponse
} from "../src/routes/telephony.js";
import {
  fromCloudonixCdr,
  fromPlivoStatus,
  fromTelnyxStatus,
  fromTwilioStatus,
  fromVonageStatus,
  normalizeTelnyxEventType
} from "../src/services/telephony/statusProcessor.js";

test("telephony status mappers preserve Python provider status normalization", () => {
  assert.deepEqual(
    {
      call_id: fromTwilioStatus({ CallSid: "CA1", CallStatus: "completed" }).call_id,
      status: fromTwilioStatus({ CallSid: "CA1", CallStatus: "completed" }).status
    },
    { call_id: "CA1", status: "completed" }
  );
  assert.equal(fromPlivoStatus({ CallUUID: "plv", CallStatus: "hangup" }).status, "completed");
  assert.equal(fromPlivoStatus({ CallUUID: "plv", Event: "timeout" }).status, "no-answer");
  assert.equal(fromVonageStatus({ uuid: "von", status: "complete" }).status, "completed");
  assert.equal(
    fromCloudonixCdr({ session: { token: "clx" }, disposition: "NOANSWER" }).status,
    "no-answer"
  );
});

test("Telnyx event type normalization accepts underscore variants", () => {
  assert.equal(normalizeTelnyxEventType("streaming_started"), "streaming.started");
  assert.equal(
    fromTelnyxStatus({
      data: {
        event_type: "call_answered",
        payload: { call_control_id: "ctrl", from: "+1", to: "+2" }
      }
    }).status,
    "answered"
  );
});

test("Twilio transfer-result statuses match Python response states", () => {
  assert.equal(
    buildTwilioTransferResult("tr", { CallStatus: "ringing" }).status,
    "pending"
  );
  assert.equal(
    (buildTwilioTransferResult("tr", { CallStatus: "answered", CallSid: "CA2" }) as any)
      .result.status,
    "success"
  );
  assert.equal(
    (buildTwilioTransferResult("tr", { CallStatus: "busy", CallSid: "CA3" }) as any)
      .result.reason,
    "busy"
  );
});

test("inbound telephony helpers detect providers and build media stream XML", () => {
  assert.equal(
    providerFromWebhook({ CallSid: "CA1" }, {}, null),
    "twilio"
  );
  assert.equal(
    providerFromWebhook(
      { CallUUID: "plivo-call" },
      { "x-vobiz-signature-v3": "sig" },
      null
    ),
    "vobiz"
  );
  assert.equal(
    callIdFromWebhook({
      data: { payload: { call_control_id: "telnyx-call" } }
    }),
    "telnyx-call"
  );

  const twilioXml = telephonyXmlResponse({
    provider: "twilio",
    workflowId: 1,
    userId: 2,
    workflowRunId: 3
  });
  assert.match(twilioXml, /<Connect><Stream url="ws:\/\/localhost:8000\/api\/v1\/telephony\/ws\/1\/2\/3">/);
  assert.doesNotMatch(twilioXml, /<Hangup/);

  const plivoXml = telephonyXmlResponse({
    provider: "plivo",
    workflowId: 1,
    userId: 2,
    workflowRunId: 3
  });
  assert.match(plivoXml, /<Stream bidirectional="true" keepCallAlive="true"/);
  assert.match(plivoXml, /ws:\/\/localhost:8000\/api\/v1\/telephony\/ws\/1\/2\/3/);
});
