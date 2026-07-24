import {
  getWorkflowRunById,
  updateWorkflowRun,
  type WorkflowRunRecord
} from "../../db/repositories/workflowRuns.js";

export type StatusCallback = {
  call_id: string;
  status: string;
  from_number?: string | null;
  to_number?: string | null;
  direction?: string | null;
  duration?: string | null;
  extra?: Record<string, unknown>;
};

const objectOrEmpty = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};

const stringValue = (value: unknown): string =>
  value == null ? "" : String(value);

export const fromTwilioStatus = (
  data: Record<string, unknown>
): StatusCallback => ({
  call_id: stringValue(data.CallSid),
  status: stringValue(data.CallStatus),
  from_number: data.From == null ? null : String(data.From),
  to_number: data.To == null ? null : String(data.To),
  direction: data.Direction == null ? null : String(data.Direction),
  duration:
    data.CallDuration == null && data.Duration == null
      ? null
      : stringValue(data.CallDuration ?? data.Duration),
  extra: data
});

export const fromPlivoStatus = (
  data: Record<string, unknown>
): StatusCallback => {
  const statusMap: Record<string, string> = {
    "in-progress": "answered",
    ringing: "ringing",
    ring: "ringing",
    completed: "completed",
    hangup: "completed",
    stopstream: "completed",
    busy: "busy",
    "no-answer": "no-answer",
    cancel: "canceled",
    cancelled: "canceled",
    timeout: "no-answer"
  };
  const callStatus = stringValue(data.CallStatus ?? data.Event).toLowerCase();
  return {
    call_id: stringValue(data.CallUUID ?? data.RequestUUID),
    status: statusMap[callStatus] ?? callStatus,
    from_number: data.From == null ? null : String(data.From),
    to_number: data.To == null ? null : String(data.To),
    direction: data.Direction == null ? null : String(data.Direction),
    duration: data.Duration == null ? null : String(data.Duration),
    extra: data
  };
};

export const fromVonageStatus = (
  data: Record<string, unknown>
): StatusCallback => {
  const statusMap: Record<string, string> = {
    started: "initiated",
    ringing: "ringing",
    answered: "answered",
    complete: "completed",
    failed: "failed",
    busy: "busy",
    timeout: "no-answer",
    rejected: "busy"
  };
  const status = stringValue(data.status);
  return {
    call_id: stringValue(data.uuid),
    status: statusMap[status] ?? status,
    from_number: data.from == null ? null : String(data.from),
    to_number: data.to == null ? null : String(data.to),
    direction: data.direction == null ? null : String(data.direction),
    duration: data.duration == null ? null : String(data.duration),
    extra: data
  };
};

export const normalizeTelnyxEventType = (value: unknown): string =>
  stringValue(value).replaceAll("_", ".");

export const fromTelnyxStatus = (
  data: Record<string, unknown>
): StatusCallback => {
  const envelope = objectOrEmpty(data.data);
  const payload = objectOrEmpty(envelope.payload);
  const eventType = normalizeTelnyxEventType(envelope.event_type);
  const statusMap: Record<string, string> = {
    "call.initiated": "initiated",
    "call.ringing": "ringing",
    "call.answered": "answered",
    "call.hangup": "completed"
  };
  return {
    call_id: stringValue(payload.call_control_id ?? payload.call_session_id),
    status: statusMap[eventType] ?? eventType,
    from_number: payload.from == null ? null : String(payload.from),
    to_number: payload.to == null ? null : String(payload.to),
    direction: payload.direction == null ? null : String(payload.direction),
    duration: payload.call_duration == null ? null : String(payload.call_duration),
    extra: data
  };
};

export const fromCloudonixCdr = (
  data: Record<string, unknown>
): StatusCallback => {
  const dispositionMap: Record<string, string> = {
    ANSWER: "completed",
    BUSY: "busy",
    CANCEL: "canceled",
    FAILED: "failed",
    CONGESTION: "failed",
    NOANSWER: "no-answer"
  };
  const session = objectOrEmpty(data.session);
  const disposition = stringValue(data.disposition);
  return {
    call_id: stringValue(session.token),
    status: dispositionMap[disposition.toUpperCase()] ?? disposition.toLowerCase(),
    from_number: data.from == null ? null : String(data.from),
    to_number: data.to == null ? null : String(data.to),
    duration: stringValue(data.billsec ?? data.duration ?? 0),
    extra: data
  };
};

const logsWithCallback = (
  workflowRun: WorkflowRunRecord,
  status: StatusCallback
): Record<string, unknown> => {
  const logs = objectOrEmpty(workflowRun.logs);
  const existing = logs.telephony_status_callbacks;
  const callbacks = Array.isArray(existing) ? [...existing] : [];
  callbacks.push({
    status: status.status,
    timestamp: new Date().toISOString(),
    call_id: status.call_id,
    duration: status.duration,
    ...(status.extra ?? {})
  });
  return {
    ...logs,
    telephony_status_callbacks: callbacks
  };
};

const gatheredContextForFailure = (
  workflowRun: WorkflowRunRecord,
  status: string
): Record<string, unknown> => {
  const gatheredContext = objectOrEmpty(workflowRun.gathered_context);
  const currentTags = gatheredContext.call_tags;
  const callTags = Array.isArray(currentTags) ? [...currentTags] : [];
  callTags.push("not_connected", `telephony_${status.toLowerCase()}`);
  return {
    ...gatheredContext,
    call_tags: callTags
  };
};

export const processStatusUpdate = async (
  workflowRunId: number,
  status: StatusCallback
): Promise<WorkflowRunRecord | null> => {
  const workflowRun = await getWorkflowRunById(workflowRunId);
  if (!workflowRun) {
    return null;
  }

  await updateWorkflowRun(workflowRunId, {
    logs: logsWithCallback(workflowRun, status)
  });

  if (status.status === "completed") {
    return await updateWorkflowRun(workflowRunId, {
      is_completed: true,
      state: "completed"
    });
  }

  if (["failed", "busy", "no-answer", "canceled", "error"].includes(status.status)) {
    return await updateWorkflowRun(workflowRunId, {
      is_completed: true,
      state: "completed",
      gathered_context: gatheredContextForFailure(workflowRun, status.status)
    });
  }

  return workflowRun;
};
