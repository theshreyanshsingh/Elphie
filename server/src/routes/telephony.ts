import crypto from "node:crypto";
import type { Request, RequestHandler, Response, Router } from "express";
import { z } from "zod";
import { env } from "../config/env.js";
import {
  getDefaultTelephonyConfiguration,
  getTelephonyConfigurationForOrg,
  listPhoneNumbersForConfig
} from "../db/repositories/telephonyConfigurations.js";
import {
  createWorkflowRun,
  getWorkflowRunByCallId,
  getWorkflowRunById,
  type WorkflowRunRecord,
  updateWorkflowRun
} from "../db/repositories/workflowRuns.js";
import { getWorkflowById, getWorkflowByIdForOrg } from "../db/repositories/workflows.js";
import { HttpError } from "../errors/httpError.js";
import { requireSelectedOrganization, requireUser } from "../middleware/auth.js";
import {
  fromCloudonixCdr,
  fromPlivoStatus,
  fromTelnyxStatus,
  fromTwilioStatus,
  fromVonageStatus,
  normalizeTelnyxEventType,
  processStatusUpdate,
  type StatusCallback
} from "../services/telephony/statusProcessor.js";
import { initiateOutboundCall } from "../services/telephony/outbound.js";
import {
  verifyCloudonixApiKey,
  verifyPlivoSignature,
  verifyTelnyxSignature,
  verifyTwilioSignature,
  verifyVobizSignature
} from "../services/telephony/signatures.js";

const initiateCallSchema = z.object({
  workflow_id: z.number().int(),
  workflow_run_id: z.number().int().nullable().optional(),
  phone_number: z.string().nullable().optional(),
  telephony_configuration_id: z.number().int().nullable().optional(),
  from_phone_number_id: z.number().int().nullable().optional()
});

const objectOrEmpty = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};

const bodyObject = (req: Request): Record<string, unknown> => objectOrEmpty(req.body);

const xml = (res: Response, content: string): void => {
  res.type("application/xml").send(content);
};

const xmlEscape = (value: string): string =>
  value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");

const genericHangupResponse: RequestHandler = (_req, res) => {
  xml(res, "<Response><Hangup/></Response>");
};

const selectedOrganizationId = (req: Request): number => {
  const organizationId = req.user?.selectedOrganizationId;
  if (!organizationId) {
    throw new HttpError(400, "No organization selected");
  }
  return organizationId;
};

const genericStatus = (
  data: Record<string, unknown>,
  options: {
    callIdKeys: string[];
    statusKeys: string[];
  }
): StatusCallback => {
  const callId = options.callIdKeys
    .map((key) => data[key])
    .find((value) => value != null);
  const status = options.statusKeys
    .map((key) => data[key])
    .find((value) => value != null);

  return {
    call_id: callId == null ? "" : String(callId),
    status: status == null ? "" : String(status).toLowerCase(),
    from_number: data.From == null && data.from == null ? null : String(data.From ?? data.from),
    to_number: data.To == null && data.to == null ? null : String(data.To ?? data.to),
    duration:
      data.Duration == null && data.duration == null
        ? null
        : String(data.Duration ?? data.duration),
    extra: data
  };
};

export const buildTwilioTransferResult = (
  transferId: string,
  data: Record<string, unknown>,
  context: {
    originalCallSid?: string | null;
    conferenceName?: string | null;
  } = {}
) => {
  const callStatus = String(data.CallStatus ?? "");
  const callSid = String(data.CallSid ?? "");

  if (callStatus === "in-progress" || callStatus === "answered") {
    return {
      status: "completed",
      result: {
        status: "success",
        message: "Great! The destination number answered. Let me transfer you now.",
        action: "destination_answered",
        conference_id: context.conferenceName ?? null,
        transfer_call_sid: callSid,
        original_call_sid: context.originalCallSid ?? null,
        end_call: false
      }
    };
  }

  const failureMessages: Record<string, { reason: string; message: string }> = {
    "no-answer": {
      reason: "no_answer",
      message:
        "The transfer call was not answered. The person may be busy or unavailable right now."
    },
    busy: {
      reason: "busy",
      message:
        "The transfer call encountered a busy signal. The person is likely on another call."
    },
    failed: {
      reason: "call_failed",
      message:
        "The transfer call failed to connect. There may be a network issue or the number is unavailable."
    }
  };
  const failure = failureMessages[callStatus];
  if (!failure) {
    return { status: "pending", transfer_id: transferId };
  }

  return {
    status: "completed",
    result: {
      status: "transfer_failed",
      reason: failure.reason,
      message: failure.message,
      action: "transfer_failed",
      call_sid: callSid,
      end_call: true
    }
  };
};

const initiateCall: RequestHandler = async (req, res, next) => {
  try {
    if (!req.user) {
      throw new HttpError(401, "Unauthorized");
    }
    const organizationId = selectedOrganizationId(req);
    const body = initiateCallSchema.parse(req.body);

    const telephonyConfiguration =
      body.telephony_configuration_id != null
        ? await getTelephonyConfigurationForOrg(
            body.telephony_configuration_id,
            organizationId
          )
        : await getDefaultTelephonyConfiguration(organizationId);
    if (!telephonyConfiguration) {
      throw new HttpError(
        400,
        body.telephony_configuration_id != null
          ? "telephony_configuration_not_found"
          : "telephony_not_configured"
      );
    }

    const phoneNumber = body.phone_number;
    if (!phoneNumber) {
      throw new HttpError(
        400,
        "Phone number must be provided in request or set in organization preferences"
      );
    }

    const workflow = await getWorkflowByIdForOrg(body.workflow_id, organizationId);
    if (!workflow) {
      throw new HttpError(404, "Workflow not found");
    }
    if (!workflow.user_id) {
      throw new HttpError(409, "Workflow has no execution owner");
    }

    let workflowRunId = body.workflow_run_id ?? null;
    let workflowRunName = "";
    if (workflowRunId == null) {
      const workflowRun = await createWorkflowRun({
        name: `WR-TEL-OUT-${crypto.randomInt(0, 100000000).toString().padStart(8, "0")}`,
        workflowId: workflow.id,
        mode: telephonyConfiguration.provider,
        userId: workflow.user_id,
        organizationId,
        useDraft: true,
        initialContext: {
          ...objectOrEmpty(workflow.template_context_variables),
          phone_number: phoneNumber,
          called_number: phoneNumber,
          provider: telephonyConfiguration.provider,
          telephony_configuration_id: telephonyConfiguration.id
        }
      });
      workflowRunId = workflowRun.id;
      workflowRunName = workflowRun.name;
    } else {
      const workflowRun = await getWorkflowRunById(workflowRunId);
      if (!workflowRun) {
        throw new HttpError(400, "Workflow run not found");
      }
      if (workflowRun.workflow_id !== workflow.id) {
        throw new HttpError(400, "workflow_run_workflow_mismatch");
      }
      workflowRunName = workflowRun.name;
    }

    const phoneNumbers = await listPhoneNumbersForConfig(telephonyConfiguration.id);
    const outbound = await initiateOutboundCall({
      configuration: telephonyConfiguration,
      phoneNumbers,
      to: phoneNumber,
      workflowRunId,
      workflowId: workflow.id,
      userId: workflow.user_id
    });

    const workflowRun = await getWorkflowRunById(workflowRunId);
    await updateWorkflowRun(workflowRunId, {
      state: "running",
      gathered_context: {
        ...objectOrEmpty(workflowRun?.gathered_context),
        call_id: outbound.provider_call_id,
        provider_call_id: outbound.provider_call_id,
        from_number: outbound.from_number,
        to_number: outbound.to_number,
        provider: outbound.provider,
        telephony_configuration_id: telephonyConfiguration.id,
        outbound_call_status: outbound.status
      }
    });

    res.json({
      message: `Call initiated successfully with run name ${workflowRunName}`,
      workflow_run_id: workflowRunId,
      status: outbound.status,
      provider: outbound.provider,
      provider_call_id: outbound.provider_call_id,
      from_number: outbound.from_number,
      to_number: outbound.to_number
    });
  } catch (err) {
    next(err);
  }
};

const websocketBackendUrl = (path: string): string =>
  `${env.backendApiEndpoint.replace(/\/+$/, "")}${path}`
    .replace(/^http:\/\//, "ws://")
    .replace(/^https:\/\//, "wss://");

export const providerFromWebhook = (
  data: Record<string, unknown>,
  headers: Request["headers"],
  fallback?: string | null
): string => {
  if (data.data && typeof data.data === "object") return "telnyx";
  if (data.Domain || data.domain || data.SessionData) return "cloudonix";
  if (headers["x-vobiz-signature-v3"] || headers["x-vobiz-signature-v2"]) {
    return "vobiz";
  }
  if (data.CallUUID || data.RequestUUID) return fallback === "vobiz" ? "vobiz" : "plivo";
  if (data.CallSid || data.AccountSid) return "twilio";
  return fallback ?? "twilio";
};

export const callIdFromWebhook = (data: Record<string, unknown>): string | null => {
  const telnyxPayload = objectOrEmpty(objectOrEmpty(data.data).payload);
  const cloudonixSession = objectOrEmpty(data.session ?? data.SessionData);
  const value =
    data.CallSid ??
    data.CallUUID ??
    data.RequestUUID ??
    data.call_uuid ??
    telnyxPayload.call_control_id ??
    cloudonixSession.token ??
    data.Session ??
    data.call_id;
  return value == null ? null : String(value);
};

export const telephonyXmlResponse = (input: {
  provider: string;
  workflowId: number;
  userId: number;
  workflowRunId: number;
}): string => {
  const streamUrl = websocketBackendUrl(
    `/api/v1/telephony/ws/${input.workflowId}/${input.userId}/${input.workflowRunId}`
  );
  if (input.provider === "plivo" || input.provider === "vobiz") {
    return `<?xml version="1.0" encoding="UTF-8"?><Response><Stream bidirectional="true" keepCallAlive="true" contentType="audio/x-mulaw;rate=8000">${xmlEscape(streamUrl)}</Stream></Response>`;
  }
  return `<?xml version="1.0" encoding="UTF-8"?><Response><Connect><Stream url="${xmlEscape(streamUrl)}"></Stream></Connect><Pause length="40"/></Response>`;
};

const inboundRun: RequestHandler = async (req, res, next) => {
  try {
    const body = bodyObject(req);
    const workflowRunId = Number(req.query.workflow_run_id ?? body.workflow_run_id);
    if (!Number.isInteger(workflowRunId)) {
      xml(res, "<Response><Hangup/></Response>");
      return;
    }
    const workflowRun = await getWorkflowRunById(workflowRunId);
    if (!workflowRun) {
      xml(res, "<Response><Hangup/></Response>");
      return;
    }
    const workflow = await getWorkflowById(workflowRun.workflow_id);
    if (!workflow?.user_id) {
      xml(res, "<Response><Hangup/></Response>");
      return;
    }
    const provider = providerFromWebhook(body, req.headers, workflowRun.mode);
    const callId = callIdFromWebhook(body);
    await updateWorkflowRun(workflowRunId, {
      state: "running",
      gathered_context: {
        ...objectOrEmpty(workflowRun.gathered_context),
        ...(callId ? { call_id: callId, provider_call_id: callId } : {}),
        provider,
        inbound_webhook: {
          provider,
          received_at: new Date().toISOString(),
          raw_webhook_data: body
        }
      }
    });
    xml(
      res,
      telephonyXmlResponse({
        provider,
        workflowId: workflow.id,
        userId: workflow.user_id,
        workflowRunId
      })
    );
  } catch (err) {
    next(err);
  }
};

const inboundLegacy: RequestHandler = async (req, res, next) => {
  try {
    const workflowId = Number(req.params.workflow_id);
    const workflow = await getWorkflowById(workflowId);
    if (!workflow?.user_id || !workflow.organization_id) {
      xml(res, "<Response><Hangup/></Response>");
      return;
    }
    const body = bodyObject(req);
    const provider = providerFromWebhook(body, req.headers, null);
    const callId = callIdFromWebhook(body);
    const workflowRun = await createWorkflowRun({
      name: `WR-TEL-IN-${crypto.randomInt(0, 100000000).toString().padStart(8, "0")}`,
      workflowId,
      mode: provider,
      userId: workflow.user_id,
      organizationId: workflow.organization_id,
      useDraft: false,
      callType: "inbound",
      initialContext: {
        caller_number: body.From ?? body.from ?? null,
        called_number: body.To ?? body.to ?? null,
        provider
      },
      gatheredContext: {
        ...(callId ? { call_id: callId, provider_call_id: callId } : {}),
        provider,
        inbound_webhook: {
          provider,
          received_at: new Date().toISOString(),
          raw_webhook_data: body
        }
      }
    });
    await updateWorkflowRun(workflowRun.id, { state: "running" });
    xml(
      res,
      telephonyXmlResponse({
        provider,
        workflowId,
        userId: workflow.user_id,
        workflowRunId: workflowRun.id
      })
    );
  } catch (err) {
    next(err);
  }
};

const transferResult: RequestHandler = (req, res, next) => {
  try {
    res.json(buildTwilioTransferResult(String(req.params.transfer_id), bodyObject(req)));
  } catch (err) {
    next(err);
  }
};

const statusHandler =
  (
    parser: (data: Record<string, unknown>) => StatusCallback,
    missingRunResponse: Record<string, unknown> = {
      status: "ignored",
      reason: "workflow_run_not_found"
    },
    verifier?: (req: Request, workflowRun: WorkflowRunRecord) => Promise<boolean>
  ): RequestHandler =>
  async (req, res, next) => {
    try {
      const workflowRunId = Number(req.params.workflow_run_id);
      if (!Number.isInteger(workflowRunId)) {
        throw new HttpError(422, "Invalid workflow_run_id");
      }
      const workflowRun = await getWorkflowRunById(workflowRunId);
      if (!workflowRun) {
        res.json(missingRunResponse);
        return;
      }
      if (verifier && !(await verifier(req, workflowRun))) {
        throw new HttpError(401, "Invalid webhook signature");
      }
      await processStatusUpdate(workflowRunId, parser(bodyObject(req)));
      res.json({ status: "success" });
    } catch (err) {
      next(err);
    }
  };

const verifyTwilioCallback = async (
  req: Request,
  workflowRun: WorkflowRunRecord
): Promise<boolean> => {
  const config = await telephonyConfigForRun(workflowRun, "twilio");
  if (!config) return true;
  const credentials = objectOrEmpty(config.credentials);
  const authToken =
    typeof credentials.auth_token === "string" ? credentials.auth_token : "";
  return verifyTwilioSignature({
    req,
    authToken,
    params: bodyObject(req),
    signature: req.header("x-twilio-signature")
  });
};

const telephonyConfigForRun = async (
  workflowRun: WorkflowRunRecord,
  provider: string
) => {
  const workflow = await getWorkflowById(workflowRun.workflow_id);
  if (!workflow?.organization_id) return null;
  const gatheredContext = objectOrEmpty(workflowRun.gathered_context);
  const configId = Number(gatheredContext.telephony_configuration_id);
  if (!Number.isInteger(configId)) return null;
  const config = await getTelephonyConfigurationForOrg(
    configId,
    workflow.organization_id
  );
  if (!config || config.provider !== provider) return null;
  return config;
};

const verifyPlivoCallback = async (
  req: Request,
  workflowRun: WorkflowRunRecord
): Promise<boolean> => {
  const config = await telephonyConfigForRun(workflowRun, "plivo");
  if (!config) return true;
  const credentials = objectOrEmpty(config.credentials);
  const authToken =
    typeof credentials.auth_token === "string" ? credentials.auth_token : "";
  return verifyPlivoSignature({
    req,
    authToken,
    params: bodyObject(req),
    signature:
      req.header("x-plivo-signature-v3") ??
      req.header("x-plivo-signature-ma-v3"),
    nonce: req.header("x-plivo-signature-v3-nonce")
  });
};

const callbackBaseUrl = (req: Request): string =>
  `${process.env.BACKEND_API_ENDPOINT ?? "http://localhost:8000"}${req.originalUrl}`
    .replace(/\?.*$/, "");

const verifyVobizCallback = async (
  req: Request,
  workflowRun: WorkflowRunRecord
): Promise<boolean> => {
  const config = await telephonyConfigForRun(workflowRun, "vobiz");
  if (!config) return true;
  const credentials = objectOrEmpty(config.credentials);
  const authToken =
    typeof credentials.auth_token === "string" ? credentials.auth_token : "";
  const signatureV3 =
    req.header("x-vobiz-signature-v3") ??
    req.header("x-vobiz-signature-ma-v3");
  if (signatureV3) {
    return verifyVobizSignature({
      authToken,
      baseUrl: callbackBaseUrl(req),
      nonce: req.header("x-vobiz-signature-v3-nonce"),
      signature: signatureV3,
      version: "v3"
    });
  }
  return verifyVobizSignature({
    authToken,
    baseUrl: callbackBaseUrl(req),
    nonce: req.header("x-vobiz-signature-v2-nonce"),
    signature:
      req.header("x-vobiz-signature-v2") ??
      req.header("x-vobiz-signature-ma-v2"),
    version: "v2"
  });
};

const verifyTelnyxCallback = async (
  req: Request,
  workflowRun: WorkflowRunRecord
): Promise<boolean> => {
  const config = await telephonyConfigForRun(workflowRun, "telnyx");
  if (!config) return true;
  const credentials = objectOrEmpty(config.credentials);
  const webhookPublicKey =
    typeof credentials.webhook_public_key === "string"
      ? credentials.webhook_public_key
      : "";
  return verifyTelnyxSignature({
    req,
    webhookPublicKey,
    signature: req.header("telnyx-signature-ed25519"),
    timestamp: req.header("telnyx-timestamp")
  });
};

const verifyCloudonixCallback = async (
  req: Request,
  workflowRun: WorkflowRunRecord
): Promise<boolean> => {
  const config = await telephonyConfigForRun(workflowRun, "cloudonix");
  if (!config) return true;
  const credentials = objectOrEmpty(config.credentials);
  const bearerToken =
    typeof credentials.bearer_token === "string" ? credentials.bearer_token : "";
  return verifyCloudonixApiKey({
    expectedApiKey: bearerToken,
    providedApiKey: req.header("x-cx-apikey")
  });
};

const cloudonixCdr: RequestHandler = async (req, res, next) => {
  try {
    const cdrData = bodyObject(req);
    if (!cdrData.domain) {
      res.json({ status: "error", message: "Missing domain field" });
      return;
    }
    const session = objectOrEmpty(cdrData.session);
    const callId = typeof session.token === "string" ? session.token : "";
    if (!callId) {
      res.json({ status: "error", message: "Missing call_id field" });
      return;
    }
    const workflowRun = await getWorkflowRunByCallId(callId);
    if (!workflowRun) {
      res.json({ status: "ignored", reason: "workflow_run_not_found" });
      return;
    }
    if (!(await verifyCloudonixCallback(req, workflowRun))) {
      throw new HttpError(401, "Invalid webhook signature");
    }
    await processStatusUpdate(workflowRun.id, fromCloudonixCdr(cdrData));
    res.json({ status: "success" });
  } catch (err) {
    next(err);
  }
};

const telnyxEvents: RequestHandler = async (req, res, next) => {
  try {
    const body = bodyObject(req);
    const data = objectOrEmpty(body.data);
    const eventType = normalizeTelnyxEventType(data.event_type);
    if (eventType === "streaming.started" || eventType === "streaming.stopped") {
      res.json({ status: "success" });
      return;
    }
    const workflowRunId = Number(req.params.workflow_run_id);
    if (!Number.isInteger(workflowRunId)) {
      throw new HttpError(422, "Invalid workflow_run_id");
    }
    const workflowRun = await getWorkflowRunById(workflowRunId);
    if (!workflowRun) {
      throw new HttpError(404, "Workflow run not found");
    }
    if (!(await verifyTelnyxCallback(req, workflowRun))) {
      throw new HttpError(401, "Invalid webhook signature");
    }
    await processStatusUpdate(workflowRunId, fromTelnyxStatus(body));
    res.json({ status: "success" });
  } catch (err) {
    next(err);
  }
};

const telnyxTransferResult: RequestHandler = (req, res) => {
  const body = bodyObject(req);
  const data = objectOrEmpty(body.data);
  const eventType = normalizeTelnyxEventType(data.event_type);
  if (eventType === "call.answered") {
    res.json({ status: "success" });
    return;
  }
  if (eventType === "call.hangup") {
    res.json({ status: "success" });
    return;
  }
  res.json({ status: "pending" });
};

const vobizHangupByWorkflow: RequestHandler = async (req, res, next) => {
  try {
    const workflowId = Number(req.params.workflow_id);
    const body = bodyObject(req);
    const callUuid = body.CallUUID ?? body.call_uuid;
    if (!callUuid) {
      res.json({ status: "error", message: "No call_uuid found" });
      return;
    }
    const workflow = await getWorkflowById(workflowId);
    if (!workflow) {
      res.json({ status: "error", message: "workflow_not_found" });
      return;
    }
    const workflowRun = await getWorkflowRunByCallId(String(callUuid));
    if (!workflowRun || workflowRun.workflow_id !== workflowId) {
      res.json({ status: "ignored", reason: "workflow_run_not_found" });
      return;
    }
    if (!(await verifyVobizCallback(req, workflowRun))) {
      throw new HttpError(401, "Invalid webhook signature");
    }
    await processStatusUpdate(workflowRun.id, fromPlivoStatus(body));
    res.json({ status: "success" });
  } catch (err) {
    next(err);
  }
};

export const registerTelephonyRoutes = (router: Router): void => {
  router.post(
    "/telephony/initiate-call",
    requireUser,
    requireSelectedOrganization,
    initiateCall
  );
  router.post("/telephony/inbound/run", inboundRun);
  router.post("/telephony/inbound/fallback", genericHangupResponse);
  router.post("/telephony/inbound/:workflow_id", inboundLegacy);
  router.post("/telephony/transfer-result/:transfer_id", transferResult);
  router.post(
    "/telephony/cloudonix/status-callback/:workflow_run_id",
    statusHandler(
      (data) =>
        genericStatus(data, {
          callIdKeys: ["call_id", "call_uuid", "CallUUID", "CallSid"],
          statusKeys: ["status", "call_status", "CallStatus", "disposition"]
        }),
      undefined,
      verifyCloudonixCallback
    )
  );
  router.post("/telephony/cloudonix/cdr", cloudonixCdr);
  router.post(
    "/telephony/plivo/hangup-callback/:workflow_run_id",
    statusHandler(fromPlivoStatus, undefined, verifyPlivoCallback)
  );
  router.post(
    "/telephony/plivo/ring-callback/:workflow_run_id",
    statusHandler(fromPlivoStatus, undefined, verifyPlivoCallback)
  );
  router.post("/telephony/telnyx/events/:workflow_run_id", telnyxEvents);
  router.post("/telephony/telnyx/transfer-result/:transfer_id", telnyxTransferResult);
  router.post(
    "/telephony/twilio/status-callback/:workflow_run_id",
    statusHandler(fromTwilioStatus, undefined, verifyTwilioCallback)
  );
  router.post(
    "/telephony/vobiz/hangup-callback/:workflow_run_id",
    statusHandler(fromPlivoStatus, undefined, verifyVobizCallback)
  );
  router.post(
    "/telephony/vobiz/ring-callback/:workflow_run_id",
    statusHandler(fromPlivoStatus, undefined, verifyVobizCallback)
  );
  router.post(
    "/telephony/vobiz/hangup-callback/workflow/:workflow_id",
    vobizHangupByWorkflow
  );
  router.post(
    "/telephony/vonage/events/:workflow_run_id",
    statusHandler(fromVonageStatus, {
      status: "error",
      message: "Workflow run not found"
    })
  );
};
