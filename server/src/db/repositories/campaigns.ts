import { sql } from "kysely";
import { db } from "../database.js";
import type { CampaignTable, JsonValue } from "../types.js";

export const DEFAULT_CAMPAIGN_RETRY_CONFIG = {
  enabled: true,
  max_retries: 2,
  retry_delay_seconds: 120,
  retry_on_busy: true,
  retry_on_no_answer: true,
  retry_on_voicemail: true
};

export type CampaignRecord = Omit<
  CampaignTable,
  "id" | "created_at" | "started_at" | "completed_at" | "updated_at" | "source_last_synced_at" | "last_batch_scheduled_at" | "last_activity_at"
> & {
  id: number;
  created_at: Date | string;
  started_at: Date | string | null;
  completed_at: Date | string | null;
  updated_at: Date | string | null;
  source_last_synced_at: Date | string | null;
  last_batch_scheduled_at: Date | string | null;
  last_activity_at: Date | string | null;
};

export type CampaignStats = {
  executed: number;
  total: number;
};

export type CampaignRunRow = {
  id: number;
  workflow_id: number;
  name: string;
  mode: string | null;
  created_at: Date | string;
  is_completed: boolean;
  recording_url: string | null;
  transcript_url: string | null;
  cost_info: JsonValue;
  usage_info: JsonValue;
  definition_id: number | null;
  initial_context: JsonValue;
  gathered_context: JsonValue;
  call_type: string | null;
};

export const createCampaign = async (input: {
  name: string;
  workflowId: number;
  sourceType: string;
  sourceId: string;
  createdBy: number;
  organizationId: number;
  retryConfig?: JsonValue | null;
  maxConcurrency?: number | null;
  scheduleConfig?: JsonValue | null;
  circuitBreaker?: JsonValue | null;
  telephonyConfigurationId?: number | null;
}): Promise<CampaignRecord> => {
  const orchestratorMetadata: Record<string, unknown> = {};
  if (input.maxConcurrency != null) {
    orchestratorMetadata.max_concurrency = input.maxConcurrency;
  }
  if (input.scheduleConfig != null) {
    orchestratorMetadata.schedule_config = input.scheduleConfig;
  }
  if (input.circuitBreaker != null) {
    orchestratorMetadata.circuit_breaker = input.circuitBreaker;
  }

  const row = await db
    .insertInto("campaigns")
    .values({
      name: input.name,
      workflow_id: input.workflowId,
      source_type: input.sourceType,
      source_id: input.sourceId,
      created_by: input.createdBy,
      organization_id: input.organizationId,
      retry_config: input.retryConfig ?? DEFAULT_CAMPAIGN_RETRY_CONFIG,
      orchestrator_metadata: orchestratorMetadata,
      telephony_configuration_id: input.telephonyConfigurationId ?? null,
      state: "created",
      total_rows: null,
      processed_rows: 0,
      failed_rows: 0,
      rate_limit_per_second: 1,
      max_retries: 0,
      source_sync_status: "pending",
      source_last_synced_at: null,
      source_sync_error: null,
      last_batch_scheduled_at: null,
      last_activity_at: null,
      logs: [],
      started_at: null,
      completed_at: null
    })
    .returningAll()
    .executeTakeFirstOrThrow();
  return row as unknown as CampaignRecord;
};

export const listCampaigns = async (
  organizationId: number
): Promise<CampaignRecord[]> => {
  const rows = await db
    .selectFrom("campaigns")
    .selectAll()
    .where("organization_id", "=", organizationId)
    .orderBy("created_at", "desc")
    .execute();
  return rows as unknown as CampaignRecord[];
};

export const getCampaign = async (
  campaignId: number,
  organizationId: number
): Promise<CampaignRecord | null> => {
  const row = await db
    .selectFrom("campaigns")
    .selectAll()
    .where("id", "=", campaignId)
    .where("organization_id", "=", organizationId)
    .executeTakeFirst();
  return (row as unknown as CampaignRecord | undefined) ?? null;
};

export const updateCampaign = async (
  campaignId: number,
  organizationId: number,
  patch: {
    name?: string;
    retry_config?: JsonValue;
    orchestrator_metadata?: JsonValue;
    state?: string;
    started_at?: Date | null;
    completed_at?: Date | null;
    total_rows?: number | null;
    processed_rows?: number;
    failed_rows?: number;
  }
): Promise<CampaignRecord | null> => {
  const row = await db
    .updateTable("campaigns")
    .set({
      ...patch,
      updated_at: new Date()
    })
    .where("id", "=", campaignId)
    .where("organization_id", "=", organizationId)
    .returningAll()
    .executeTakeFirst();
  return (row as unknown as CampaignRecord | undefined) ?? null;
};

export const updateCampaignState = async (
  campaignId: number,
  organizationId: number,
  state: string
): Promise<CampaignRecord | null> => {
  const patch: Parameters<typeof updateCampaign>[2] = { state };
  if (state === "running") {
    patch.started_at = new Date();
  } else if (state === "completed" || state === "failed") {
    patch.completed_at = new Date();
  }
  return await updateCampaign(campaignId, organizationId, patch);
};

export const getCampaignStats = async (
  campaignIds: number[]
): Promise<Map<number, CampaignStats>> => {
  const stats = new Map<number, CampaignStats>(
    campaignIds.map((id) => [id, { executed: 0, total: 0 }])
  );
  if (campaignIds.length === 0) {
    return stats;
  }
  const rows = await db
    .selectFrom("queued_runs")
    .select([
      "campaign_id",
      "state",
      sql<number>`count(id)`.as("count")
    ])
    .where("campaign_id", "in", campaignIds)
    .groupBy(["campaign_id", "state"])
    .execute();
  for (const row of rows) {
    const item = stats.get(Number(row.campaign_id)) ?? { executed: 0, total: 0 };
    item.total += Number(row.count);
    if (row.state === "processed") {
      item.executed += Number(row.count);
    }
    stats.set(Number(row.campaign_id), item);
  }
  return stats;
};

export const getWorkflowNamesForCampaigns = async (
  workflowIds: number[],
  organizationId: number
): Promise<Map<number, string>> => {
  if (workflowIds.length === 0) {
    return new Map();
  }
  const rows = await db
    .selectFrom("workflows")
    .select(["id", "name"])
    .where("id", "in", workflowIds)
    .where("organization_id", "=", organizationId)
    .execute();
  return new Map(rows.map((row) => [Number(row.id), String(row.name)]));
};

export const getCampaignRuns = async (input: {
  campaignId: number;
  organizationId: number;
  limit: number;
  offset: number;
}): Promise<{ runs: CampaignRunRow[]; totalCount: number }> => {
  const campaign = await getCampaign(input.campaignId, input.organizationId);
  if (!campaign) {
    throw new Error(`Campaign ${input.campaignId} not found`);
  }

  const countRow = await db
    .selectFrom("workflow_runs")
    .select(sql<number>`count(id)`.as("count"))
    .where("campaign_id", "=", input.campaignId)
    .executeTakeFirst();

  const rows = await db
    .selectFrom("workflow_runs")
    .select([
      "id",
      "workflow_id",
      "name",
      "mode",
      "created_at",
      "is_completed",
      "recording_url",
      "transcript_url",
      "cost_info",
      "usage_info",
      "definition_id",
      "initial_context",
      "gathered_context",
      "call_type"
    ])
    .where("campaign_id", "=", input.campaignId)
    .orderBy("created_at", "desc")
    .limit(input.limit)
    .offset(input.offset)
    .execute();

  return {
    runs: rows as unknown as CampaignRunRow[],
    totalCount: Number(countRow?.count ?? 0)
  };
};

export const getCampaignReportRows = async (input: {
  campaignId: number;
  startDate?: Date | null;
  endDate?: Date | null;
}): Promise<CampaignRunRow[]> => {
  let query = db
    .selectFrom("workflow_runs")
    .select([
      "id",
      "workflow_id",
      "name",
      "mode",
      "created_at",
      "is_completed",
      "recording_url",
      "transcript_url",
      "cost_info",
      "usage_info",
      "definition_id",
      "initial_context",
      "gathered_context",
      "call_type"
    ])
    .where("campaign_id", "=", input.campaignId)
    .where("is_completed", "=", true);

  if (input.startDate) {
    query = query.where("created_at", ">=", input.startDate);
  }
  if (input.endDate) {
    query = query.where("created_at", "<=", input.endDate);
  }

  const rows = await query.orderBy("created_at", "desc").execute();
  return rows as unknown as CampaignRunRow[];
};
