import { randomUUID } from "node:crypto";
import { sql } from "kysely";
import { db } from "../database.js";
import type { JsonValue, WorkflowRunTable } from "../types.js";
import { getCurrentStorageBackend } from "../../services/storage/storage.js";
import {
  getWorkflowDefinitionForExecution,
  objectOrEmpty,
  type WorkflowRecord
} from "./workflows.js";

export type SuperuserWorkflowRun = {
  id: number;
  name: string;
  workflow_id: number;
  workflow_name: string | null;
  user_id: number | null;
  organization_id: number | null;
  organization_name: string | null;
  mode: string;
  is_completed: boolean;
  recording_url: string | null;
  transcript_url: string | null;
  usage_info: unknown;
  cost_info: unknown;
  initial_context: unknown;
  gathered_context: unknown;
  created_at: Date | string;
};

export type WorkflowRunFilter = {
  attribute?: string;
  type?: string;
  value?: Record<string, unknown>;
};

export type WorkflowRunStorageInfo = {
  id: number;
  workflow_id: number;
  organization_id: number | null;
  storage_backend: string | null;
};

export type WorkflowRunRecord = Omit<
  WorkflowRunTable,
  "id" | "created_at"
> & {
  id: number;
  created_at: Date | string;
};

export type WorkflowRunTextSessionRecord = {
  workflow_run_id: number;
  workflow_id: number;
  name: string;
  mode: string;
  state: string;
  is_completed: boolean;
  revision: number;
  initial_context: JsonValue;
  gathered_context: JsonValue;
  annotations: JsonValue;
  session_data: JsonValue;
  checkpoint: JsonValue;
  created_at: Date | string;
  updated_at: Date | string | null;
};

const jsonHasKeys = (value: JsonValue | null | undefined): boolean =>
  Boolean(
    value &&
      typeof value === "object" &&
      !Array.isArray(value) &&
      Object.keys(value as Record<string, unknown>).length > 0
  );

const getWorkflowForRunCreation = async (input: {
  workflowId: number;
  organizationId: number;
  userId: number;
}): Promise<WorkflowRecord | null> => {
  const row = await db
    .selectFrom("workflows")
    .selectAll()
    .where("id", "=", input.workflowId)
    .where("organization_id", "=", input.organizationId)
    .where("user_id", "=", input.userId)
    .executeTakeFirst();
  return (row as unknown as WorkflowRecord | undefined) ?? null;
};

export const createWorkflowRun = async (input: {
  name: string;
  workflowId: number;
  mode: string;
  userId: number;
  organizationId: number;
  initialContext?: Record<string, unknown> | null;
  gatheredContext?: Record<string, unknown> | null;
  logs?: Record<string, unknown> | null;
  campaignId?: number | null;
  queuedRunId?: number | null;
  useDraft?: boolean;
  callType?: "inbound" | "outbound";
}): Promise<WorkflowRunRecord> => {
  const workflow = await getWorkflowForRunCreation({
    workflowId: input.workflowId,
    organizationId: input.organizationId,
    userId: input.userId
  });
  if (!workflow) {
    throw new Error(`Workflow with ID ${input.workflowId} not found`);
  }

  const definition = await getWorkflowDefinitionForExecution(workflow, {
    useDraft: input.useDraft ?? false
  });
  const defaultContext = jsonHasKeys(definition?.template_context_variables)
    ? objectOrEmpty(definition?.template_context_variables)
    : objectOrEmpty(workflow.template_context_variables);

  const row = await db
    .insertInto("workflow_runs")
    .values({
      name: input.name,
      workflow_id: workflow.id,
      mode: input.mode,
      definition_id: definition?.id ?? null,
      call_type: input.callType ?? "outbound",
      state: "initialized",
      is_completed: false,
      recording_url: null,
      transcript_url: null,
      extra: {},
      storage_backend: getCurrentStorageBackend(),
      usage_info: {},
      cost_info: {},
      initial_context: input.initialContext ?? defaultContext,
      gathered_context: input.gatheredContext ?? {},
      logs: input.logs ?? {},
      annotations: {},
      campaign_id: input.campaignId ?? null,
      queued_run_id: input.queuedRunId ?? null,
      public_access_token: null
    })
    .returningAll()
    .executeTakeFirstOrThrow();

  return row as unknown as WorkflowRunRecord;
};

const applyFilters = (
  query: any,
  filters: WorkflowRunFilter[] | null
) => {
  let next = query;
  for (const filter of filters ?? []) {
    const value = filter.value ?? {};
    if (filter.type === "number" && filter.attribute === "runId") {
      next = next.where("workflow_runs.id", "=", Number(value.value));
    } else if (filter.type === "number" && filter.attribute === "workflowId") {
      next = next.where("workflow_runs.workflow_id", "=", Number(value.value));
    } else if (filter.type === "number" && filter.attribute === "campaignId") {
      next = next.where("workflow_runs.campaign_id", "=", Number(value.value));
    } else if (filter.type === "radio" && filter.attribute === "status") {
      if (value.status === "completed") {
        next = next.where("workflow_runs.is_completed", "=", true);
      } else if (value.status === "in_progress") {
        next = next.where("workflow_runs.is_completed", "=", false);
      }
    } else if (filter.type === "dateRange" && filter.attribute === "dateRange") {
      if (typeof value.from === "string") {
        next = next.where("workflow_runs.created_at", ">=", new Date(value.from));
      }
      if (typeof value.to === "string") {
        next = next.where("workflow_runs.created_at", "<=", new Date(value.to));
      }
    }
  }
  return next;
};

export const getWorkflowRunsForSuperadmin = async (input: {
  limit: number;
  offset: number;
  filters: WorkflowRunFilter[] | null;
  sortBy: string | null;
  sortOrder: "asc" | "desc";
}): Promise<{ workflowRuns: SuperuserWorkflowRun[]; totalCount: number }> => {
  const base = db
    .selectFrom("workflow_runs")
    .innerJoin("workflows", "workflow_runs.workflow_id", "workflows.id")
    .leftJoin("users", "workflows.user_id", "users.id")
    .leftJoin("organizations", "users.selected_organization_id", "organizations.id");

  const filtered = applyFilters(base as any, input.filters);

  const countRow = await filtered
    .select(sql<number>`count(workflow_runs.id)`.as("count"))
    .executeTakeFirst();

  const sortExpression =
    input.sortBy === "duration"
      ? sql<number>`(workflow_runs.usage_info->>'call_duration_seconds')::float`
      : sql<Date>`workflow_runs.created_at`;

  const rows = await filtered
    .select([
      "workflow_runs.id as id",
      "workflow_runs.name as name",
      "workflow_runs.workflow_id as workflow_id",
      "workflows.name as workflow_name",
      "workflows.user_id as user_id",
      "organizations.id as organization_id",
      "organizations.provider_id as organization_name",
      "workflow_runs.mode as mode",
      "workflow_runs.is_completed as is_completed",
      "workflow_runs.recording_url as recording_url",
      "workflow_runs.transcript_url as transcript_url",
      "workflow_runs.usage_info as usage_info",
      "workflow_runs.cost_info as cost_info",
      "workflow_runs.initial_context as initial_context",
      "workflow_runs.gathered_context as gathered_context",
      "workflow_runs.created_at as created_at"
    ])
    .orderBy(sortExpression, input.sortOrder)
    .limit(input.limit)
    .offset(input.offset)
    .execute();

  return {
    workflowRuns: rows as unknown as SuperuserWorkflowRun[],
    totalCount: Number(countRow?.count ?? 0)
  };
};

export const getWorkflowRunStorageInfo = async (input: {
  workflowRunId: number;
  organizationId?: number | null;
  isSuperuser?: boolean;
}): Promise<WorkflowRunStorageInfo | null> => {
  let query = db
    .selectFrom("workflow_runs")
    .innerJoin("workflows", "workflow_runs.workflow_id", "workflows.id")
    .select([
      "workflow_runs.id as id",
      "workflow_runs.workflow_id as workflow_id",
      "workflows.organization_id as organization_id",
      "workflow_runs.storage_backend as storage_backend"
    ])
    .where("workflow_runs.id", "=", input.workflowRunId);

  if (!input.isSuperuser) {
    if (!input.organizationId) {
      return null;
    }
    query = query.where("workflows.organization_id", "=", input.organizationId);
  }

  const row = await query.executeTakeFirst();
  return (row as WorkflowRunStorageInfo | undefined) ?? null;
};

export const getWorkflowRunByPublicToken = async (
  token: string
): Promise<WorkflowRunRecord | null> => {
  const row = await db
    .selectFrom("workflow_runs")
    .selectAll()
    .where("public_access_token", "=", token)
    .executeTakeFirst();
  return (row as unknown as WorkflowRunRecord | undefined) ?? null;
};

export const getWorkflowRunById = async (
  workflowRunId: number
): Promise<WorkflowRunRecord | null> => {
  const row = await db
    .selectFrom("workflow_runs")
    .selectAll()
    .where("id", "=", workflowRunId)
    .executeTakeFirst();
  return (row as unknown as WorkflowRunRecord | undefined) ?? null;
};

export const getWorkflowRunForOrg = async (input: {
  workflowRunId: number;
  workflowId?: number | null;
  organizationId: number;
}): Promise<WorkflowRunRecord | null> => {
  let query = db
    .selectFrom("workflow_runs")
    .innerJoin("workflows", "workflow_runs.workflow_id", "workflows.id")
    .selectAll("workflow_runs")
    .where("workflow_runs.id", "=", input.workflowRunId)
    .where("workflows.organization_id", "=", input.organizationId);
  if (input.workflowId != null) {
    query = query.where("workflow_runs.workflow_id", "=", input.workflowId);
  }
  const row = await query.executeTakeFirst();
  return (row as unknown as WorkflowRunRecord | undefined) ?? null;
};

export const ensurePublicAccessToken = async (
  workflowRunId: number
): Promise<string> => {
  const existing = await db
    .selectFrom("workflow_runs")
    .select("public_access_token")
    .where("id", "=", workflowRunId)
    .executeTakeFirst();
  if (existing?.public_access_token) return existing.public_access_token;
  const token = randomUUID();
  await db
    .updateTable("workflow_runs")
    .set({ public_access_token: token })
    .where("id", "=", workflowRunId)
    .executeTakeFirst();
  return token;
};

export const getWorkflowRunsByWorkflowForOrg = async (input: {
  workflowId: number;
  organizationId: number;
  limit: number;
  offset: number;
  filters?: WorkflowRunFilter[] | null;
  sortBy?: string | null;
  sortOrder?: "asc" | "desc";
}): Promise<{ runs: WorkflowRunRecord[]; totalCount: number }> => {
  const base = db
    .selectFrom("workflow_runs")
    .innerJoin("workflows", "workflow_runs.workflow_id", "workflows.id")
    .where("workflow_runs.workflow_id", "=", input.workflowId)
    .where("workflows.organization_id", "=", input.organizationId);
  const filtered = applyFilters(base as any, input.filters ?? null);
  const countRow = await filtered
    .select(sql<number>`count(workflow_runs.id)`.as("count"))
    .executeTakeFirst();
  const sortExpression =
    input.sortBy === "duration"
      ? sql<number>`(workflow_runs.usage_info->>'call_duration_seconds')::float`
      : sql<Date>`workflow_runs.created_at`;
  const rows = await filtered
    .selectAll("workflow_runs")
    .orderBy(sortExpression, input.sortOrder ?? "desc")
    .limit(input.limit)
    .offset(input.offset)
    .execute();
  return {
    runs: rows as unknown as WorkflowRunRecord[],
    totalCount: Number(countRow?.count ?? 0)
  };
};

export const getWorkflowRunByCallId = async (
  callId: string
): Promise<WorkflowRunRecord | null> => {
  const row = await db
    .selectFrom("workflow_runs")
    .selectAll()
    .where(sql<string>`gathered_context->>'call_id'`, "=", callId)
    .executeTakeFirst();
  return (row as unknown as WorkflowRunRecord | undefined) ?? null;
};

export const updateWorkflowRun = async (
  workflowRunId: number,
  patch: {
    state?: string;
    is_completed?: boolean;
    recording_url?: string | null;
    transcript_url?: string | null;
    extra?: JsonValue;
    usage_info?: JsonValue;
    cost_info?: JsonValue;
    initial_context?: JsonValue;
    gathered_context?: JsonValue;
    logs?: JsonValue;
    annotations?: JsonValue;
  }
): Promise<WorkflowRunRecord | null> => {
  const row = await db
    .updateTable("workflow_runs")
    .set(patch)
    .where("id", "=", workflowRunId)
    .returningAll()
    .executeTakeFirst();
  return (row as unknown as WorkflowRunRecord | undefined) ?? null;
};

export const ensureWorkflowRunTextSession = async (input: {
  workflowRunId: number;
  sessionData?: Record<string, unknown>;
  checkpoint?: Record<string, unknown>;
}): Promise<WorkflowRunTextSessionRecord> => {
  const existing = await db
    .selectFrom("workflow_run_text_sessions as ts")
    .innerJoin("workflow_runs as wr", "ts.workflow_run_id", "wr.id")
    .select([
      "ts.workflow_run_id as workflow_run_id",
      "wr.workflow_id as workflow_id",
      "wr.name as name",
      "wr.mode as mode",
      "wr.state as state",
      "wr.is_completed as is_completed",
      "ts.revision as revision",
      "wr.initial_context as initial_context",
      "wr.gathered_context as gathered_context",
      "wr.annotations as annotations",
      "ts.session_data as session_data",
      "ts.checkpoint as checkpoint",
      "ts.created_at as created_at",
      "ts.updated_at as updated_at"
    ])
    .where("ts.workflow_run_id", "=", input.workflowRunId)
    .executeTakeFirst();
  if (existing) return existing as unknown as WorkflowRunTextSessionRecord;

  await db
    .insertInto("workflow_run_text_sessions")
    .values({
      workflow_run_id: input.workflowRunId,
      revision: 0,
      session_data: input.sessionData ?? {},
      checkpoint: input.checkpoint ?? {},
      updated_at: new Date()
    })
    .executeTakeFirst();

  const created = await getWorkflowRunTextSessionForOrg({
    workflowRunId: input.workflowRunId,
    organizationId: Number.MAX_SAFE_INTEGER,
    skipOrgCheck: true
  });
  if (!created) throw new Error("Failed to create workflow run text session");
  return created;
};

export const getWorkflowRunTextSessionForOrg = async (input: {
  workflowRunId: number;
  organizationId: number;
  workflowId?: number | null;
  skipOrgCheck?: boolean;
}): Promise<WorkflowRunTextSessionRecord | null> => {
  let query = db
    .selectFrom("workflow_run_text_sessions as ts")
    .innerJoin("workflow_runs as wr", "ts.workflow_run_id", "wr.id")
    .innerJoin("workflows as w", "wr.workflow_id", "w.id")
    .select([
      "ts.workflow_run_id as workflow_run_id",
      "wr.workflow_id as workflow_id",
      "wr.name as name",
      "wr.mode as mode",
      "wr.state as state",
      "wr.is_completed as is_completed",
      "ts.revision as revision",
      "wr.initial_context as initial_context",
      "wr.gathered_context as gathered_context",
      "wr.annotations as annotations",
      "ts.session_data as session_data",
      "ts.checkpoint as checkpoint",
      "ts.created_at as created_at",
      "ts.updated_at as updated_at"
    ])
    .where("ts.workflow_run_id", "=", input.workflowRunId);
  if (!input.skipOrgCheck) {
    query = query.where("w.organization_id", "=", input.organizationId);
  }
  if (input.workflowId != null) {
    query = query.where("wr.workflow_id", "=", input.workflowId);
  }
  const row = await query.executeTakeFirst();
  return (row as unknown as WorkflowRunTextSessionRecord | undefined) ?? null;
};

export class TextSessionRevisionConflictError extends Error {
  constructor(
    public expectedRevision: number,
    public actualRevision: number
  ) {
    super(
      `Workflow run text session revision conflict: expected ${expectedRevision}, found ${actualRevision}`
    );
  }
}

export const updateWorkflowRunTextSession = async (input: {
  workflowRunId: number;
  organizationId: number;
  sessionData?: Record<string, unknown>;
  checkpoint?: Record<string, unknown>;
  expectedRevision?: number | null;
}): Promise<WorkflowRunTextSessionRecord | null> => {
  const current = await getWorkflowRunTextSessionForOrg({
    workflowRunId: input.workflowRunId,
    organizationId: input.organizationId
  });
  if (!current) return null;
  if (
    input.expectedRevision != null &&
    current.revision !== input.expectedRevision
  ) {
    throw new TextSessionRevisionConflictError(
      input.expectedRevision,
      current.revision
    );
  }

  const patch: Record<string, unknown> = {
    revision: current.revision + 1,
    updated_at: new Date()
  };
  if (input.sessionData !== undefined) patch.session_data = input.sessionData;
  if (input.checkpoint !== undefined) patch.checkpoint = input.checkpoint;

  await db
    .updateTable("workflow_run_text_sessions")
    .set(patch)
    .where("workflow_run_id", "=", input.workflowRunId)
    .executeTakeFirst();

  return await getWorkflowRunTextSessionForOrg({
    workflowRunId: input.workflowRunId,
    organizationId: input.organizationId
  });
};
