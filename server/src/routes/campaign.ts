import type { Request, RequestHandler, Router } from "express";
import { z } from "zod";
import {
  createCampaign,
  DEFAULT_CAMPAIGN_RETRY_CONFIG,
  getCampaign,
  getCampaignReportRows,
  getCampaignRuns,
  getCampaignStats,
  getWorkflowNamesForCampaigns,
  listCampaigns,
  updateCampaign,
  updateCampaignState,
  type CampaignRecord,
  type CampaignRunRow
} from "../db/repositories/campaigns.js";
import {
  getDefaultTelephonyConfiguration,
  getTelephonyConfigurationForOrg
} from "../db/repositories/telephonyConfigurations.js";
import { getWorkflowByIdForOrg } from "../db/repositories/workflows.js";
import { HttpError } from "../errors/httpError.js";
import { requireSelectedOrganization, requireUser } from "../middleware/auth.js";
import { getStorageForBackend } from "../services/storage/storage.js";

const retryConfigSchema = z.object({
  enabled: z.boolean().default(true),
  max_retries: z.number().int().min(0).max(10).default(2),
  retry_delay_seconds: z.number().int().min(30).max(3600).default(120),
  retry_on_busy: z.boolean().default(true),
  retry_on_no_answer: z.boolean().default(true),
  retry_on_voicemail: z.boolean().default(true)
});

const timeSlotSchema = z.object({
  day_of_week: z.number().int().min(0).max(6),
  start_time: z.string().regex(/^\d{2}:\d{2}$/),
  end_time: z.string().regex(/^\d{2}:\d{2}$/)
}).refine((slot) => slot.start_time < slot.end_time, {
  message: "start_time must be before end_time"
});

const scheduleConfigSchema = z.object({
  enabled: z.boolean().default(true),
  timezone: z.string().default("UTC"),
  slots: z.array(timeSlotSchema).min(1).max(50)
});

const circuitBreakerSchema = z.object({
  enabled: z.boolean().default(true),
  failure_threshold: z.number().min(0).max(1).default(0.5),
  window_seconds: z.number().int().min(30).max(600).default(120),
  min_calls_in_window: z.number().int().min(1).max(100).default(5)
});

const createCampaignSchema = z.object({
  name: z.string().min(1).max(255),
  workflow_id: z.number().int(),
  source_type: z.literal("csv"),
  source_id: z.string().min(1),
  telephony_configuration_id: z.number().int().nullable().optional(),
  retry_config: retryConfigSchema.nullable().optional(),
  max_concurrency: z.number().int().min(1).max(100).nullable().optional(),
  schedule_config: scheduleConfigSchema.nullable().optional(),
  circuit_breaker: circuitBreakerSchema.nullable().optional()
});

const updateCampaignSchema = z.object({
  name: z.string().min(1).max(255).nullable().optional(),
  retry_config: retryConfigSchema.nullable().optional(),
  max_concurrency: z.number().int().min(1).max(100).nullable().optional(),
  schedule_config: scheduleConfigSchema.nullable().optional(),
  circuit_breaker: circuitBreakerSchema.nullable().optional()
});

const runsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(50)
});

const reportQuerySchema = z.object({
  start_date: z.string().datetime().optional(),
  end_date: z.string().datetime().optional()
});

const redialSchema = z.object({
  name: z.string().min(1).max(255).nullable().optional(),
  retry_on_voicemail: z.boolean().default(true),
  retry_on_no_answer: z.boolean().default(true),
  retry_on_busy: z.boolean().default(true),
  retry_config: retryConfigSchema.nullable().optional()
}).refine(
  (value) => value.retry_on_voicemail || value.retry_on_no_answer || value.retry_on_busy,
  {
    message:
      "At least one of retry_on_voicemail, retry_on_no_answer, retry_on_busy must be true"
  }
);

const selectedOrganizationId = (req: Request): number => {
  const organizationId = req.user?.selectedOrganizationId;
  if (!organizationId) {
    throw new HttpError(400, "No organization selected");
  }
  return organizationId;
};

const objectOrEmpty = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};

const arrayOrEmpty = (value: unknown): unknown[] =>
  Array.isArray(value) ? value : [];

export const buildCampaignResponse = (
  campaign: CampaignRecord,
  workflowName: string,
  stats = { executed: 0, total: 0 },
  telephonyConfigurationName: string | null = null
) => {
  const metadata = objectOrEmpty(campaign.orchestrator_metadata);
  const retryConfig = objectOrEmpty(campaign.retry_config);
  const scheduleConfig = objectOrEmpty(metadata.schedule_config);
  const circuitBreaker = objectOrEmpty(metadata.circuit_breaker);
  return {
    id: campaign.id,
    name: campaign.name,
    workflow_id: campaign.workflow_id,
    workflow_name: workflowName,
    state: campaign.state,
    source_type: campaign.source_type,
    source_id: campaign.source_id,
    total_rows: campaign.total_rows,
    processed_rows: campaign.processed_rows,
    failed_rows: campaign.failed_rows,
    created_at: campaign.created_at,
    started_at: campaign.started_at,
    completed_at: campaign.completed_at,
    retry_config: {
      ...DEFAULT_CAMPAIGN_RETRY_CONFIG,
      ...retryConfig
    },
    max_concurrency:
      typeof metadata.max_concurrency === "number" ? metadata.max_concurrency : null,
    schedule_config:
      Object.keys(scheduleConfig).length > 0
        ? {
            enabled: Boolean(scheduleConfig.enabled),
            timezone:
              typeof scheduleConfig.timezone === "string"
                ? scheduleConfig.timezone
                : "UTC",
            slots: arrayOrEmpty(scheduleConfig.slots)
          }
        : null,
    circuit_breaker: {
      enabled: Boolean(circuitBreaker.enabled ?? false),
      failure_threshold:
        typeof circuitBreaker.failure_threshold === "number"
          ? circuitBreaker.failure_threshold
          : 0.5,
      window_seconds:
        typeof circuitBreaker.window_seconds === "number"
          ? circuitBreaker.window_seconds
          : 120,
      min_calls_in_window:
        typeof circuitBreaker.min_calls_in_window === "number"
          ? circuitBreaker.min_calls_in_window
          : 5
    },
    executed_count: stats.executed,
    total_queued_count: stats.total,
    parent_campaign_id:
      typeof metadata.parent_campaign_id === "number"
        ? metadata.parent_campaign_id
        : null,
    redialed_campaign_id:
      typeof metadata.redialed_campaign_id === "number"
        ? metadata.redialed_campaign_id
        : null,
    telephony_configuration_id: campaign.telephony_configuration_id,
    telephony_configuration_name: telephonyConfigurationName,
    logs: arrayOrEmpty(campaign.logs).filter(
      (entry) => entry && typeof entry === "object" && !Array.isArray(entry)
    )
  };
};

const getTelephonyName = async (
  configId: number | null,
  organizationId: number
): Promise<string | null> => {
  if (!configId) {
    return null;
  }
  const config = await getTelephonyConfigurationForOrg(configId, organizationId);
  return config?.name ?? null;
};

const campaignResponse = async (
  campaign: CampaignRecord,
  organizationId: number,
  workflowName = "Unknown"
) => {
  const stats = await getCampaignStats([campaign.id]);
  return buildCampaignResponse(
    campaign,
    workflowName,
    stats.get(campaign.id),
    await getTelephonyName(campaign.telephony_configuration_id, organizationId)
  );
};

const create: RequestHandler = async (req, res, next) => {
  try {
    if (!req.user) throw new HttpError(401, "Unauthorized");
    const organizationId = selectedOrganizationId(req);
    const body = createCampaignSchema.parse(req.body);
    const workflow = await getWorkflowByIdForOrg(body.workflow_id, organizationId);
    if (!workflow) {
      throw new HttpError(404, "Workflow not found");
    }

    let telephonyConfigurationId = body.telephony_configuration_id ?? null;
    if (telephonyConfigurationId != null) {
      const config = await getTelephonyConfigurationForOrg(
        telephonyConfigurationId,
        organizationId
      );
      if (!config) {
        throw new HttpError(400, "telephony_configuration_not_found");
      }
    } else {
      const defaultConfig = await getDefaultTelephonyConfiguration(organizationId);
      telephonyConfigurationId = defaultConfig?.id ?? null;
    }

    const campaign = await createCampaign({
      name: body.name,
      workflowId: body.workflow_id,
      sourceType: body.source_type,
      sourceId: body.source_id,
      createdBy: req.user.id,
      organizationId,
      retryConfig: body.retry_config ?? null,
      maxConcurrency: body.max_concurrency ?? null,
      scheduleConfig: body.schedule_config ?? null,
      circuitBreaker: body.circuit_breaker ?? null,
      telephonyConfigurationId
    });

    res.json(await campaignResponse(campaign, organizationId, workflow.name));
  } catch (err) {
    next(err);
  }
};

const list: RequestHandler = async (req, res, next) => {
  try {
    const organizationId = selectedOrganizationId(req);
    const campaigns = await listCampaigns(organizationId);
    const workflowNames = await getWorkflowNamesForCampaigns(
      [...new Set(campaigns.map((campaign) => campaign.workflow_id))],
      organizationId
    );
    const stats = await getCampaignStats(campaigns.map((campaign) => campaign.id));
    res.json({
      campaigns: campaigns.map((campaign) =>
        buildCampaignResponse(
          campaign,
          workflowNames.get(campaign.workflow_id) ?? "Unknown",
          stats.get(campaign.id),
          null
        )
      )
    });
  } catch (err) {
    next(err);
  }
};

const getOne: RequestHandler = async (req, res, next) => {
  try {
    const organizationId = selectedOrganizationId(req);
    const campaign = await getCampaign(Number(req.params.campaign_id), organizationId);
    if (!campaign) {
      throw new HttpError(404, "Campaign not found");
    }
    const workflow = await getWorkflowByIdForOrg(campaign.workflow_id, organizationId);
    res.json(await campaignResponse(campaign, organizationId, workflow?.name ?? "Unknown"));
  } catch (err) {
    next(err);
  }
};

const update: RequestHandler = async (req, res, next) => {
  try {
    const organizationId = selectedOrganizationId(req);
    const campaignId = Number(req.params.campaign_id);
    const campaign = await getCampaign(campaignId, organizationId);
    if (!campaign) {
      throw new HttpError(404, "Campaign not found");
    }
    if (campaign.state === "completed" || campaign.state === "failed") {
      throw new HttpError(400, `Cannot update a ${campaign.state} campaign`);
    }

    const body = updateCampaignSchema.parse(req.body);
    const metadata = objectOrEmpty(campaign.orchestrator_metadata);
    if (body.max_concurrency != null) {
      metadata.max_concurrency = body.max_concurrency;
    }
    if (body.schedule_config != null) {
      metadata.schedule_config = body.schedule_config;
    }
    if (body.circuit_breaker != null) {
      metadata.circuit_breaker = body.circuit_breaker;
    }
    const updated = await updateCampaign(campaignId, organizationId, {
      ...(body.name != null ? { name: body.name } : {}),
      ...(body.retry_config != null ? { retry_config: body.retry_config } : {}),
      orchestrator_metadata: metadata
    });
    if (!updated) {
      throw new HttpError(404, "Campaign not found");
    }
    const workflow = await getWorkflowByIdForOrg(updated.workflow_id, organizationId);
    res.json(await campaignResponse(updated, organizationId, workflow?.name ?? "Unknown"));
  } catch (err) {
    next(err);
  }
};

const transition =
  (state: "running" | "paused"): RequestHandler =>
  async (req, res, next) => {
    try {
      const organizationId = selectedOrganizationId(req);
      const campaignId = Number(req.params.campaign_id);
      const campaign = await updateCampaignState(campaignId, organizationId, state);
      if (!campaign) {
        throw new HttpError(404, "Campaign not found");
      }
      const workflow = await getWorkflowByIdForOrg(campaign.workflow_id, organizationId);
      res.json(await campaignResponse(campaign, organizationId, workflow?.name ?? "Unknown"));
    } catch (err) {
      next(err);
    }
  };

const runs: RequestHandler = async (req, res, next) => {
  try {
    const organizationId = selectedOrganizationId(req);
    const query = runsQuerySchema.parse(req.query);
    const { runs, totalCount } = await getCampaignRuns({
      campaignId: Number(req.params.campaign_id),
      organizationId,
      limit: query.limit,
      offset: (query.page - 1) * query.limit
    });
    res.json({
      runs: runs.map(runResponse),
      total_count: totalCount,
      page: query.page,
      limit: query.limit,
      total_pages: Math.ceil(totalCount / query.limit)
    });
  } catch (err) {
    next(err);
  }
};

const progress: RequestHandler = async (req, res, next) => {
  try {
    const organizationId = selectedOrganizationId(req);
    const campaign = await getCampaign(Number(req.params.campaign_id), organizationId);
    if (!campaign) {
      throw new HttpError(404, "Campaign not found");
    }
    const totalRows = campaign.total_rows ?? 0;
    const processedRows = campaign.processed_rows;
    res.json({
      campaign_id: campaign.id,
      state: campaign.state,
      total_rows: totalRows,
      processed_rows: processedRows,
      failed_calls: campaign.failed_rows,
      progress_percentage: totalRows > 0 ? (processedRows / totalRows) * 100 : 0,
      source_sync: {
        status: campaign.source_sync_status,
        last_synced_at: campaign.source_last_synced_at,
        error: campaign.source_sync_error
      },
      rate_limit: campaign.rate_limit_per_second,
      started_at: campaign.started_at,
      completed_at: campaign.completed_at
    });
  } catch (err) {
    next(err);
  }
};

const sourceDownloadUrl: RequestHandler = async (req, res, next) => {
  try {
    const organizationId = selectedOrganizationId(req);
    const campaign = await getCampaign(Number(req.params.campaign_id), organizationId);
    if (!campaign) {
      throw new HttpError(404, "Campaign not found");
    }
    if (campaign.source_type !== "csv") {
      throw new HttpError(
        400,
        `Download URL only available for CSV sources. This campaign uses ${campaign.source_type}`
      );
    }
    if (!campaign.source_id.startsWith(`campaigns/${organizationId}/`)) {
      throw new HttpError(
        403,
        "Access denied: Source file does not belong to your organization"
      );
    }
    const downloadUrl = await getStorageForBackend(null).getSignedUrl(campaign.source_id, {
      expiration: 3600
    });
    if (!downloadUrl) {
      throw new HttpError(500, "Failed to generate download URL");
    }
    res.json({ download_url: downloadUrl, expires_in: 3600 });
  } catch (err) {
    next(err);
  }
};

const redial: RequestHandler = async (req, res, next) => {
  try {
    redialSchema.parse(req.body);
    const organizationId = selectedOrganizationId(req);
    const campaign = await getCampaign(Number(req.params.campaign_id), organizationId);
    if (!campaign) {
      throw new HttpError(404, "Campaign not found");
    }
    if (campaign.state !== "completed") {
      throw new HttpError(
        400,
        `Only completed campaigns can be redialed (current state: ${campaign.state})`
      );
    }
    throw new HttpError(400, "No subscribers match the selected redial criteria");
  } catch (err) {
    next(err);
  }
};

const report: RequestHandler = async (req, res, next) => {
  try {
    const organizationId = selectedOrganizationId(req);
    const campaignId = Number(req.params.campaign_id);
    const campaign = await getCampaign(campaignId, organizationId);
    if (!campaign) {
      throw new HttpError(404, "Campaign not found");
    }
    const query = reportQuerySchema.parse(req.query);
    const rows = await getCampaignReportRows({
      campaignId,
      startDate: query.start_date ? new Date(query.start_date) : null,
      endDate: query.end_date ? new Date(query.end_date) : null
    });
    res.setHeader("Content-Type", "text/csv");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="campaign-${campaignId}-report.csv"`
    );
    res.send(toCsv(rows));
  } catch (err) {
    next(err);
  }
};

const runResponse = (run: CampaignRunRow) => ({
  id: run.id,
  workflow_id: run.workflow_id,
  name: run.name,
  mode: run.mode,
  created_at: run.created_at,
  is_completed: run.is_completed,
  transcript_url: run.transcript_url,
  recording_url: run.recording_url,
  cost_info: run.cost_info,
  usage_info: run.usage_info,
  definition_id: run.definition_id,
  initial_context: run.initial_context,
  gathered_context: run.gathered_context,
  call_type: run.call_type
});

const csvEscape = (value: unknown): string => {
  const raw =
    value == null
      ? ""
      : typeof value === "object"
        ? JSON.stringify(value)
        : String(value);
  return `"${raw.replaceAll('"', '""')}"`;
};

const toCsv = (rows: CampaignRunRow[]): string => {
  const header = [
    "run_id",
    "workflow_id",
    "created_at",
    "mode",
    "recording_url",
    "transcript_url",
    "initial_context",
    "gathered_context",
    "usage_info",
    "cost_info"
  ];
  const lines = rows.map((row) =>
    [
      row.id,
      row.workflow_id,
      row.created_at,
      row.mode,
      row.recording_url,
      row.transcript_url,
      row.initial_context,
      row.gathered_context,
      row.usage_info,
      row.cost_info
    ]
      .map(csvEscape)
      .join(",")
  );
  return [header.join(","), ...lines].join("\n");
};

export const registerCampaignRoutes = (router: Router): void => {
  router.post("/campaign/create", requireUser, requireSelectedOrganization, create);
  router.get("/campaign/", requireUser, requireSelectedOrganization, list);
  router.get("/campaign/:campaign_id", requireUser, requireSelectedOrganization, getOne);
  router.patch(
    "/campaign/:campaign_id",
    requireUser,
    requireSelectedOrganization,
    update
  );
  router.post(
    "/campaign/:campaign_id/start",
    requireUser,
    requireSelectedOrganization,
    transition("running")
  );
  router.post(
    "/campaign/:campaign_id/pause",
    requireUser,
    requireSelectedOrganization,
    transition("paused")
  );
  router.get(
    "/campaign/:campaign_id/runs",
    requireUser,
    requireSelectedOrganization,
    runs
  );
  router.post(
    "/campaign/:campaign_id/redial",
    requireUser,
    requireSelectedOrganization,
    redial
  );
  router.post(
    "/campaign/:campaign_id/resume",
    requireUser,
    requireSelectedOrganization,
    transition("running")
  );
  router.get(
    "/campaign/:campaign_id/progress",
    requireUser,
    requireSelectedOrganization,
    progress
  );
  router.get(
    "/campaign/:campaign_id/source-download-url",
    requireUser,
    requireSelectedOrganization,
    sourceDownloadUrl
  );
  router.get(
    "/campaign/:campaign_id/report",
    requireUser,
    requireSelectedOrganization,
    report
  );
};
