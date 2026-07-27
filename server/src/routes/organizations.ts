import { sql } from "kysely";
import type { Request, RequestHandler, Router } from "express";
import { z } from "zod";
import { db } from "../db/database.js";
import {
  getOrganizationById,
  type OrganizationRecord
} from "../db/repositories/organizations.js";
import {
  type JsonObject,
  getOrganizationConfigurationValue,
  getOrganizationPreferences,
  upsertOrganizationConfigurationValue,
  upsertOrganizationPreferences
} from "../db/repositories/userConfigurations.js";
import {
  countTelnyxConfigsMissingWebhookPublicKey,
  createPhoneNumber,
  createTelephonyConfiguration,
  deletePhoneNumber,
  deleteTelephonyConfiguration,
  getDefaultTelephonyConfiguration,
  getPhoneNumberForConfig,
  getTelephonyConfigurationForOrg,
  listActiveNormalizedAddressesForConfig,
  listPhoneNumbersForConfig,
  listTelephonyConfigurations,
  setDefaultCallerId,
  setDefaultTelephonyConfiguration,
  updatePhoneNumber,
  updateTelephonyConfiguration,
  type TelephonyConfigurationRecord,
  type TelephonyPhoneNumberRecord
} from "../db/repositories/telephonyConfigurations.js";
import { getWorkflowByIdForOrg } from "../db/repositories/workflows.js";
import { env } from "../config/env.js";
import { HttpError } from "../errors/httpError.js";
import { requireSelectedOrganization, requireUser } from "../middleware/auth.js";
import {
  buildDailyReport,
  fetchWorkflowRunsForDailyReport,
  formatDailyRunsDetail
} from "../services/reports/dailyReport.js";
import {
  defaultConfigurationSchemas,
  maskUserConfig
} from "../services/configuration/userConfig.js";
import {
  allProviders
} from "../services/telephony/registry.js";
import { registerTelephonyProviders } from "../services/telephony/providers/index.js";

const MODEL_CONFIGURATION_V2 = "MODEL_CONFIGURATION_V2";
const LANGFUSE_CREDENTIALS = "LANGFUSE_CREDENTIALS";
const CONCURRENT_CALL_LIMIT = "CONCURRENT_CALL_LIMIT";

const anyObject = z.record(z.unknown());

const modelConfigSchema = anyObject.default({});
const preferencesSchema = z.object({
  test_phone_number: z.string().nullable().optional(),
  timezone: z.string().nullable().optional()
});
const telephonyConfigSchema = z.object({
  name: z.string().min(1).max(64),
  config: anyObject.and(z.object({ provider: z.string().min(1) })),
  is_default_outbound: z.boolean().default(false)
});
const telephonyConfigUpdateSchema = z.object({
  name: z.string().min(1).max(64).nullable().optional(),
  config: anyObject.and(z.object({ provider: z.string().min(1) })).nullable().optional()
});
const phoneNumberCreateSchema = z.object({
  address: z.string().min(1),
  country_code: z.string().length(2).nullable().optional(),
  label: z.string().max(64).nullable().optional(),
  inbound_workflow_id: z.number().int().nullable().optional(),
  is_active: z.boolean().default(true),
  is_default_caller_id: z.boolean().default(false),
  extra_metadata: anyObject.nullable().optional()
});
const phoneNumberUpdateSchema = z.object({
  label: z.string().max(64).nullable().optional(),
  inbound_workflow_id: z.number().int().nullable().optional(),
  clear_inbound_workflow: z.boolean().nullable().optional(),
  is_active: z.boolean().nullable().optional(),
  country_code: z.string().length(2).nullable().optional(),
  extra_metadata: anyObject.nullable().optional()
});
const langfuseSchema = z.object({
  host: z.string(),
  public_key: z.string(),
  secret_key: z.string()
});
const purchaseSchema = z.object({
  amount_minor: z.number().int().positive().optional(),
  credits: z.number().positive().optional()
}).passthrough();
const usageQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  start_date: z.string().datetime().optional(),
  end_date: z.string().datetime().optional()
});

const selectedOrganizationId = (req: Request): number => {
  const organizationId = req.user?.selectedOrganizationId;
  if (!organizationId) throw new HttpError(400, "No organization selected");
  return organizationId;
};

const objectOrEmpty = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};

const arrayOrEmpty = (value: unknown): unknown[] =>
  Array.isArray(value) ? value : [];

const asJsonObject = (value: Record<string, unknown>): JsonObject => value as JsonObject;

const maskKey = (value: string): string =>
  value.length <= 4 ? "*".repeat(value.length) : `${"*".repeat(value.length - 4)}${value.slice(-4)}`;

const maskSensitiveCredentials = (credentials: unknown): Record<string, unknown> => {
  const value = objectOrEmpty(credentials);
  const masked = { ...value };
  for (const key of Object.keys(masked)) {
    if (/key|secret|token|password/i.test(key) && typeof masked[key] === "string") {
      masked[key] = maskKey(masked[key] as string);
    }
  }
  return masked;
};

const telephonyDetail = (row: TelephonyConfigurationRecord) => ({
  id: row.id,
  name: row.name,
  provider: row.provider,
  is_default_outbound: row.is_default_outbound,
  credentials: maskSensitiveCredentials(row.credentials),
  created_at: row.created_at,
  updated_at: row.updated_at
});

const phoneNumberResponse = (row: TelephonyPhoneNumberRecord) => ({
  id: row.id,
  organization_id: row.organization_id,
  telephony_configuration_id: row.telephony_configuration_id,
  address: row.address,
  address_normalized: row.address_normalized,
  address_type: row.address_type,
  country_code: row.country_code,
  label: row.label,
  inbound_workflow_id: row.inbound_workflow_id,
  inbound_workflow_name: row.inbound_workflow_name ?? null,
  is_active: row.is_active,
  is_default_caller_id: row.is_default_caller_id,
  extra_metadata: objectOrEmpty(row.extra_metadata),
  created_at: row.created_at,
  updated_at: row.updated_at,
  provider_sync: null
});

const ensureWorkflow = async (
  workflowId: number | null | undefined,
  organizationId: number
) => {
  if (workflowId == null) return;
  const workflow = await getWorkflowByIdForOrg(workflowId, organizationId);
  if (!workflow) throw new HttpError(404, "Workflow not found");
};

const orgContext: RequestHandler = async (req, res, next) => {
  try {
    const organizationId = selectedOrganizationId(req);
    const organization = await getOrganizationById(organizationId);
    res.json({
      organization_id: organizationId,
      organization_provider_id: organization?.provider_id ?? null,
      deployment_mode: env.deploymentMode,
      auth_provider: env.authProvider,
      selected_organization_id: organizationId,
      user_id: req.user?.id ?? null,
      provider_id: req.user?.providerId ?? null,
      email: req.user?.email ?? null
    });
  } catch (err) {
    next(err);
  }
};

const providerMetadata: RequestHandler = (_req, res) => {
  registerTelephonyProviders();
  res.json({
    providers: allProviders().map((provider) => ({
      provider: provider.name,
      display_name: provider.uiMetadata?.displayName ?? provider.name,
      fields: provider.uiMetadata?.fields ?? [],
      docs_url: provider.uiMetadata?.docsUrl ?? null
    }))
  });
};

const warnings: RequestHandler = async (req, res, next) => {
  try {
    res.json({
      telnyx_missing_webhook_public_key_count:
        await countTelnyxConfigsMissingWebhookPublicKey(selectedOrganizationId(req))
    });
  } catch (err) {
    next(err);
  }
};

const modelDefaults: RequestHandler = (_req, res) => {
  const schemas = defaultConfigurationSchemas();
  res.json({
    elphie: {
      voices: ["default"],
      allow_custom_input: true,
      speeds: [0.8, 0.9, 1, 1.1, 1.2],
      speed_range: { min: 0.5, max: 2, step: 0.1 },
      languages: ["multi", "en", "hi"],
      defaults: { voice: "default", speed: 1, language: "multi" }
    },
    byok: {
      pipeline: schemas,
      realtime: schemas
    }
  });
};

const getModelConfig: RequestHandler = async (req, res, next) => {
  try {
    const organizationId = selectedOrganizationId(req);
    const configuration =
      (await getOrganizationConfigurationValue(organizationId, MODEL_CONFIGURATION_V2)) ?? {};
    res.json({
      configuration: maskUserConfig(configuration),
      effective_configuration: maskUserConfig(configuration),
      source: Object.keys(configuration).length ? "organization" : "default"
    });
  } catch (err) {
    next(err);
  }
};

const putModelConfig: RequestHandler = async (req, res, next) => {
  try {
    const organizationId = selectedOrganizationId(req);
    const configuration = modelConfigSchema.parse(req.body);
    await upsertOrganizationConfigurationValue(
      organizationId,
      MODEL_CONFIGURATION_V2,
      asJsonObject(configuration)
    );
    res.json({
      configuration: maskUserConfig(configuration),
      effective_configuration: maskUserConfig(configuration),
      source: "organization"
    });
  } catch (err) {
    next(err);
  }
};

const modelMigrationPreview: RequestHandler = (_req, res) => {
  res.json({
    configuration: {},
    effective_configuration: maskUserConfig({})
  });
};

const modelMigration: RequestHandler = async (req, res, next) => {
  try {
    const organizationId = selectedOrganizationId(req);
    const existing = await getOrganizationConfigurationValue(
      organizationId,
      MODEL_CONFIGURATION_V2
    );
    if (existing && req.query.force !== "true") {
      throw new HttpError(409, "Organization already has a v2 model configuration");
    }
    await upsertOrganizationConfigurationValue(organizationId, MODEL_CONFIGURATION_V2, existing ?? {});
    res.json({
      configuration: maskUserConfig(existing ?? {}),
      effective_configuration: maskUserConfig(existing ?? {}),
      source: "organization"
    });
  } catch (err) {
    next(err);
  }
};

const getPreferences: RequestHandler = async (req, res, next) => {
  try {
    res.json(await getOrganizationPreferences(selectedOrganizationId(req)));
  } catch (err) {
    next(err);
  }
};

const putPreferences: RequestHandler = async (req, res, next) => {
  try {
    res.json(
      await upsertOrganizationPreferences(
        selectedOrganizationId(req),
        preferencesSchema.parse(req.body)
      )
    );
  } catch (err) {
    next(err);
  }
};

const listTelephonyConfigs: RequestHandler = async (req, res, next) => {
  try {
    const rows = await listTelephonyConfigurations(selectedOrganizationId(req));
    const configurations = await Promise.all(
      rows.map(async (row) => ({
        id: row.id,
        name: row.name,
        provider: row.provider,
        is_default_outbound: row.is_default_outbound,
        phone_number_count: (await listPhoneNumbersForConfig(row.id)).filter((n) => n.is_active).length,
        created_at: row.created_at,
        updated_at: row.updated_at
      }))
    );
    res.json({ configurations });
  } catch (err) {
    next(err);
  }
};

const createTelephonyConfig: RequestHandler = async (req, res, next) => {
  try {
    const organizationId = selectedOrganizationId(req);
    const body = telephonyConfigSchema.parse(req.body);
    const { provider, from_numbers, ...credentials } = body.config;
    const row = await createTelephonyConfiguration({
      organizationId,
      name: body.name,
      provider,
      credentials,
      isDefaultOutbound: body.is_default_outbound
    });
    for (const address of Array.isArray(from_numbers) ? from_numbers : []) {
      if (typeof address === "string") {
        await createPhoneNumber({ organizationId, configId: row.id, address });
      }
    }
    res.json(telephonyDetail(row));
  } catch (err) {
    next(err);
  }
};

const getTelephonyConfig: RequestHandler = async (req, res, next) => {
  try {
    const row = await getTelephonyConfigurationForOrg(
      Number(req.params.config_id),
      selectedOrganizationId(req)
    );
    if (!row) throw new HttpError(404, "Telephony configuration not found");
    res.json(telephonyDetail(row));
  } catch (err) {
    next(err);
  }
};

const updateTelephonyConfig: RequestHandler = async (req, res, next) => {
  try {
    const organizationId = selectedOrganizationId(req);
    const existing = await getTelephonyConfigurationForOrg(
      Number(req.params.config_id),
      organizationId
    );
    if (!existing) throw new HttpError(404, "Telephony configuration not found");
    const body = telephonyConfigUpdateSchema.parse(req.body);
    let credentials: Record<string, unknown> | null = null;
    if (body.config) {
      if (body.config.provider !== existing.provider) {
        throw new HttpError(
          400,
          "Provider cannot be changed; create a new configuration instead."
        );
      }
      const { provider: _provider, from_numbers: _fromNumbers, ...rest } = body.config;
      credentials = { ...objectOrEmpty(existing.credentials), ...rest };
    }
    const row = await updateTelephonyConfiguration({
      configId: existing.id,
      organizationId,
      name: body.name,
      credentials
    });
    if (!row) throw new HttpError(404, "Telephony configuration not found");
    res.json(telephonyDetail(row));
  } catch (err) {
    next(err);
  }
};

const deleteTelephonyConfig: RequestHandler = async (req, res, next) => {
  try {
    const deleted = await deleteTelephonyConfiguration(
      Number(req.params.config_id),
      selectedOrganizationId(req)
    );
    if (!deleted) throw new HttpError(404, "Telephony configuration not found");
    res.json({ message: "Telephony configuration deleted" });
  } catch (err) {
    next(err);
  }
};

const setDefaultOutbound: RequestHandler = async (req, res, next) => {
  try {
    const row = await setDefaultTelephonyConfiguration(
      Number(req.params.config_id),
      selectedOrganizationId(req)
    );
    if (!row) throw new HttpError(404, "Telephony configuration not found");
    res.json(telephonyDetail(row));
  } catch (err) {
    next(err);
  }
};

const listPhones: RequestHandler = async (req, res, next) => {
  try {
    const config = await getTelephonyConfigurationForOrg(
      Number(req.params.config_id),
      selectedOrganizationId(req)
    );
    if (!config) throw new HttpError(404, "Telephony configuration not found");
    const rows = await listPhoneNumbersForConfig(config.id);
    res.json({ phone_numbers: rows.map(phoneNumberResponse) });
  } catch (err) {
    next(err);
  }
};

const createPhone: RequestHandler = async (req, res, next) => {
  try {
    const organizationId = selectedOrganizationId(req);
    const config = await getTelephonyConfigurationForOrg(Number(req.params.config_id), organizationId);
    if (!config) throw new HttpError(404, "Telephony configuration not found");
    const body = phoneNumberCreateSchema.parse(req.body);
    await ensureWorkflow(body.inbound_workflow_id, organizationId);
    const row = await createPhoneNumber({
      organizationId,
      configId: config.id,
      address: body.address,
      countryCode: body.country_code,
      label: body.label,
      inboundWorkflowId: body.inbound_workflow_id,
      isActive: body.is_active,
      isDefaultCallerId: body.is_default_caller_id,
      extraMetadata: body.extra_metadata ?? {}
    });
    res.json(phoneNumberResponse(row));
  } catch (err) {
    next(err);
  }
};

const getPhone: RequestHandler = async (req, res, next) => {
  try {
    await getTelephonyConfigurationForOrg(Number(req.params.config_id), selectedOrganizationId(req));
    const row = await getPhoneNumberForConfig(
      Number(req.params.phone_number_id),
      Number(req.params.config_id)
    );
    if (!row) throw new HttpError(404, "Phone number not found");
    res.json(phoneNumberResponse(row));
  } catch (err) {
    next(err);
  }
};

const updatePhone: RequestHandler = async (req, res, next) => {
  try {
    const organizationId = selectedOrganizationId(req);
    const config = await getTelephonyConfigurationForOrg(Number(req.params.config_id), organizationId);
    if (!config) throw new HttpError(404, "Telephony configuration not found");
    const body = phoneNumberUpdateSchema.parse(req.body);
    await ensureWorkflow(body.inbound_workflow_id, organizationId);
    const row = await updatePhoneNumber({
      phoneNumberId: Number(req.params.phone_number_id),
      configId: config.id,
      label: body.label,
      inboundWorkflowId: body.inbound_workflow_id,
      clearInboundWorkflow: Boolean(body.clear_inbound_workflow),
      isActive: body.is_active ?? undefined,
      countryCode: body.country_code,
      extraMetadata: body.extra_metadata
    });
    if (!row) throw new HttpError(404, "Phone number not found");
    res.json(phoneNumberResponse(row));
  } catch (err) {
    next(err);
  }
};

const defaultCaller: RequestHandler = async (req, res, next) => {
  try {
    const row = await setDefaultCallerId(
      Number(req.params.phone_number_id),
      Number(req.params.config_id)
    );
    if (!row) throw new HttpError(404, "Phone number not found");
    res.json(phoneNumberResponse(row));
  } catch (err) {
    next(err);
  }
};

const deletePhone: RequestHandler = async (req, res, next) => {
  try {
    const deleted = await deletePhoneNumber(
      Number(req.params.phone_number_id),
      Number(req.params.config_id)
    );
    if (!deleted) throw new HttpError(404, "Phone number not found");
    res.json({ message: "Phone number deleted" });
  } catch (err) {
    next(err);
  }
};

const legacyGetTelephonyConfig: RequestHandler = async (req, res, next) => {
  try {
    const config = await getDefaultTelephonyConfiguration(selectedOrganizationId(req));
    if (!config) {
      res.json({});
      return;
    }
    const addresses = await listActiveNormalizedAddressesForConfig(config.id);
    res.json({
      [config.provider]: {
        provider: config.provider,
        ...maskSensitiveCredentials(config.credentials),
        from_numbers: addresses
      }
    });
  } catch (err) {
    next(err);
  }
};

const legacySaveTelephonyConfig: RequestHandler = async (req, res, next) => {
  try {
    const organizationId = selectedOrganizationId(req);
    const body = anyObject.and(z.object({ provider: z.string() })).parse(req.body);
    const { provider, from_numbers, ...credentials } = body;
    const existing = await getDefaultTelephonyConfiguration(organizationId);
    let config: TelephonyConfigurationRecord;
    if (existing && existing.provider === provider) {
      const updated = await updateTelephonyConfiguration({
        configId: existing.id,
        organizationId,
        credentials
      });
      config = updated ?? existing;
    } else {
      config = await createTelephonyConfiguration({
        organizationId,
        name: `${provider[0]?.toUpperCase() ?? ""}${provider.slice(1)} Default`,
        provider,
        credentials,
        isDefaultOutbound: true
      });
    }
    for (const address of Array.isArray(from_numbers) ? from_numbers : []) {
      if (typeof address === "string") {
        try {
          await createPhoneNumber({ organizationId, configId: config.id, address });
        } catch {
          // existing address; legacy endpoint is best-effort like Python migration shim
        }
      }
    }
    res.json({ message: "Telephony configuration saved successfully" });
  } catch (err) {
    next(err);
  }
};

const getLangfuse: RequestHandler = async (req, res, next) => {
  try {
    const config = await getOrganizationConfigurationValue(
      selectedOrganizationId(req),
      LANGFUSE_CREDENTIALS
    );
    if (!config) {
      res.json({ host: "", public_key: "", secret_key: "", configured: false });
      return;
    }
    res.json({
      host: typeof config.host === "string" ? config.host : "",
      public_key: typeof config.public_key === "string" ? maskKey(config.public_key) : "",
      secret_key: typeof config.secret_key === "string" ? maskKey(config.secret_key) : "",
      configured: true
    });
  } catch (err) {
    next(err);
  }
};

const saveLangfuse: RequestHandler = async (req, res, next) => {
  try {
    await upsertOrganizationConfigurationValue(
      selectedOrganizationId(req),
      LANGFUSE_CREDENTIALS,
      langfuseSchema.parse(req.body)
    );
    res.json({ message: "Langfuse credentials saved successfully" });
  } catch (err) {
    next(err);
  }
};

const deleteLangfuse: RequestHandler = async (req, res, next) => {
  try {
    const result = await db
      .deleteFrom("organization_configurations")
      .where("organization_id", "=", selectedOrganizationId(req))
      .where("key", "=", LANGFUSE_CREDENTIALS)
      .executeTakeFirst();
    if (Number(result.numDeletedRows) === 0) {
      throw new HttpError(404, "No Langfuse credentials found");
    }
    res.json({ message: "Langfuse credentials deleted successfully" });
  } catch (err) {
    next(err);
  }
};

const campaignDefaults: RequestHandler = async (req, res, next) => {
  try {
    const organizationId = selectedOrganizationId(req);
    const concurrentConfig = await getOrganizationConfigurationValue(
      organizationId,
      CONCURRENT_CALL_LIMIT
    );
    const defaultConfig = await getDefaultTelephonyConfiguration(organizationId);
    const fromNumbersCount = defaultConfig
      ? (await listActiveNormalizedAddressesForConfig(defaultConfig.id)).length
      : 0;
    res.json({
      concurrent_call_limit:
        typeof concurrentConfig?.value === "number" ? concurrentConfig.value : 10,
      from_numbers_count: fromNumbersCount,
      default_retry_config: {
        enabled: true,
        max_retries: 2,
        retry_delay_seconds: 120,
        retry_on_busy: true,
        retry_on_no_answer: true,
        retry_on_voicemail: true
      },
      last_campaign_settings: null
    });
  } catch (err) {
    next(err);
  }
};

const currentUsage: RequestHandler = async (req, res, next) => {
  try {
    const organization = await getOrganizationById(selectedOrganizationId(req));
    const now = new Date();
    const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
    const row = await usageAggregate(selectedOrganizationId(req), start, end);
    res.json({
      period_start: start.toISOString(),
      period_end: end.toISOString(),
      used_elphie_tokens: row.tokens,
      total_duration_seconds: row.duration,
      used_amount_usd:
        organization?.price_per_second_usd != null
          ? row.duration * organization.price_per_second_usd
          : null,
      currency: organization?.price_per_second_usd != null ? "USD" : null,
      price_per_second_usd: organization?.price_per_second_usd ?? null
    });
  } catch (err) {
    next(err);
  }
};

const mpsCredits: RequestHandler = (_req, res) => {
  res.json({ total_credits_used: 0, remaining_credits: 0, total_quota: 0 });
};

const billingCredits: RequestHandler = (req, res) => {
  const page = Number(req.query.page ?? 1);
  const limit = Number(req.query.limit ?? 50);
  res.json({
    billing_version: "legacy",
    total_credits_used: 0,
    remaining_credits: 0,
    total_quota: 0,
    account: null,
    ledger_entries: [],
    total_count: 0,
    page,
    limit,
    total_pages: 0
  });
};

const purchaseUrl: RequestHandler = (req, res) => {
  purchaseSchema.parse(req.body);
  res.json({ checkout_url: `${env.uiAppUrl}/billing` });
};

const usageAggregate = async (
  organizationId: number,
  start?: Date | null,
  end?: Date | null
) => {
  let query = db
    .selectFrom("workflow_runs as wr")
    .innerJoin("workflows as w", "wr.workflow_id", "w.id")
    .select([
      sql<number>`COALESCE(sum((wr.usage_info->>'elphie_token_usage')::float), 0)`.as("tokens"),
      sql<number>`COALESCE(sum((wr.usage_info->>'call_duration_seconds')::int), 0)`.as("duration"),
      sql<number>`count(wr.id)`.as("count")
    ])
    .where("w.organization_id", "=", organizationId);
  if (start) query = query.where("wr.created_at", ">=", start);
  if (end) query = query.where("wr.created_at", "<=", end);
  const row = await query.executeTakeFirst();
  return {
    tokens: Number(row?.tokens ?? 0),
    duration: Number(row?.duration ?? 0),
    count: Number(row?.count ?? 0)
  };
};

const usageRunsQuery = async (
  organizationId: number,
  page: number,
  limit: number
) => {
  const offset = (page - 1) * limit;
  const base = db
    .selectFrom("workflow_runs as wr")
    .innerJoin("workflows as w", "wr.workflow_id", "w.id")
    .where("w.organization_id", "=", organizationId);
  const countRow = await base
    .select(sql<number>`count(wr.id)`.as("count"))
    .executeTakeFirst();
  const rows = await base
    .select([
      "wr.id as id",
      "wr.workflow_id as workflow_id",
      "w.name as workflow_name",
      "wr.name as name",
      "wr.created_at as created_at",
      "wr.usage_info as usage_info",
      "wr.cost_info as cost_info",
      "wr.initial_context as initial_context",
      "wr.gathered_context as gathered_context",
      "wr.recording_url as recording_url",
      "wr.transcript_url as transcript_url",
      "wr.public_access_token as public_access_token",
      "wr.call_type as call_type",
      "wr.mode as mode"
    ])
    .orderBy("wr.created_at", "desc")
    .limit(limit)
    .offset(offset)
    .execute();
  return { rows, total: Number(countRow?.count ?? 0) };
};

const usageRunResponse = (run: Record<string, unknown>) => {
  const usage = objectOrEmpty(run.usage_info);
  const cost = objectOrEmpty(run.cost_info);
  const initial = objectOrEmpty(run.initial_context);
  const gathered = objectOrEmpty(run.gathered_context);
  return {
    id: run.id,
    workflow_id: run.workflow_id,
    workflow_name: run.workflow_name ?? null,
    name: run.name,
    created_at: run.created_at,
    elphie_token_usage: Number(usage.elphie_token_usage ?? usage.total_elphie_tokens ?? 0),
    call_duration_seconds: Number(usage.call_duration_seconds ?? 0),
    recording_url: run.recording_url ?? null,
    transcript_url: run.transcript_url ?? null,
    user_recording_url: null,
    bot_recording_url: null,
    recording_public_url: null,
    transcript_public_url: null,
    user_recording_public_url: null,
    bot_recording_public_url: null,
    public_access_token: run.public_access_token ?? null,
    phone_number: initial.phone_number ?? null,
    caller_number: initial.caller_number ?? null,
    called_number: initial.called_number ?? null,
    call_type: run.call_type ?? null,
    mode: run.mode ?? null,
    disposition: gathered.disposition ?? null,
    initial_context: initial,
    gathered_context: gathered,
    charge_usd: typeof cost.charge_usd === "number" ? cost.charge_usd : null
  };
};

const usageRuns: RequestHandler = async (req, res, next) => {
  try {
    const organizationId = selectedOrganizationId(req);
    const query = usageQuerySchema.parse(req.query);
    const result = await usageRunsQuery(organizationId, query.page, query.limit);
    const aggregate = await usageAggregate(organizationId, null, null);
    res.json({
      runs: result.rows.map((row) => usageRunResponse(row as Record<string, unknown>)),
      total_elphie_tokens: aggregate.tokens,
      total_duration_seconds: aggregate.duration,
      total_count: result.total,
      page: query.page,
      limit: query.limit,
      total_pages: Math.ceil(result.total / query.limit)
    });
  } catch (err) {
    next(err);
  }
};

const usageRunsReport: RequestHandler = async (req, res, next) => {
  try {
    const result = await usageRunsQuery(selectedOrganizationId(req), 1, 10_000);
    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", 'attachment; filename="usage-runs-report.csv"');
    res.send(toCsv(result.rows.map((row) => usageRunResponse(row as Record<string, unknown>))));
  } catch (err) {
    next(err);
  }
};

const dailyBreakdown: RequestHandler = async (req, res, next) => {
  try {
    const organizationId = selectedOrganizationId(req);
    const rows = await db
      .selectFrom("workflow_runs as wr")
      .innerJoin("workflows as w", "wr.workflow_id", "w.id")
      .select([
        sql<string>`to_char(wr.created_at, 'YYYY-MM-DD')`.as("date"),
        sql<number>`COALESCE(sum((wr.usage_info->>'call_duration_seconds')::float), 0)`.as("seconds"),
        sql<number>`COALESCE(sum((wr.usage_info->>'elphie_token_usage')::float), 0)`.as("tokens"),
        sql<number>`count(wr.id)`.as("count")
      ])
      .where("w.organization_id", "=", organizationId)
      .groupBy(sql`to_char(wr.created_at, 'YYYY-MM-DD')`)
      .orderBy("date", "desc")
      .execute();
    const breakdown = rows.map((row) => ({
      date: row.date,
      minutes: Number(row.seconds) / 60,
      cost_usd: null,
      elphie_tokens: Number(row.tokens),
      call_count: Number(row.count)
    }));
    res.json({
      breakdown,
      total_minutes: breakdown.reduce((sum, item) => sum + item.minutes, 0),
      total_cost_usd: null,
      total_elphie_tokens: breakdown.reduce((sum, item) => sum + item.elphie_tokens, 0),
      currency: null
    });
  } catch (err) {
    next(err);
  }
};

const dailyReportQuerySchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  timezone: z.string().min(1),
  workflow_id: z.coerce.number().optional()
});

const dailyReport: RequestHandler = async (req, res, next) => {
  try {
    const query = dailyReportQuerySchema.parse(req.query);
    const organizationId = selectedOrganizationId(req);
    const runs = await fetchWorkflowRunsForDailyReport({
      organizationId,
      date: query.date,
      timezone: query.timezone,
      workflowId: query.workflow_id
    });
    res.json(
      buildDailyReport({
        date: query.date,
        timezone: query.timezone,
        workflowId: query.workflow_id ?? null,
        runs
      })
    );
  } catch (err) {
    next(err);
  }
};

const workflowOptions: RequestHandler = async (req, res, next) => {
  try {
    const rows = await db
      .selectFrom("workflows")
      .select(["id", "name"])
      .where("organization_id", "=", selectedOrganizationId(req))
      .orderBy("name", "asc")
      .execute();
    res.json(rows);
  } catch (err) {
    next(err);
  }
};

const dailyRuns: RequestHandler = async (req, res, next) => {
  try {
    const query = dailyReportQuerySchema.parse(req.query);
    const runs = await fetchWorkflowRunsForDailyReport({
      organizationId: selectedOrganizationId(req),
      date: query.date,
      timezone: query.timezone,
      workflowId: query.workflow_id
    });
    res.json(formatDailyRunsDetail(runs));
  } catch (err) {
    next(err);
  }
};

const toCsv = (rows: Record<string, unknown>[]): string => {
  const headers = Object.keys(rows[0] ?? { id: "", name: "" });
  const escape = (value: unknown) => `"${String(value ?? "").replaceAll('"', '""')}"`;
  return [
    headers.join(","),
    ...rows.map((row) => headers.map((header) => escape(row[header])).join(","))
  ].join("\n");
};

export const registerOrganizationRoutes = (router: Router): void => {
  router.get("/organizations/context", requireUser, orgContext);
  router.get("/organizations/telephony-providers/metadata", requireUser, requireSelectedOrganization, providerMetadata);
  router.get("/organizations/telephony-config-warnings", requireUser, requireSelectedOrganization, warnings);
  router.get("/organizations/model-configurations/v2/defaults", requireUser, requireSelectedOrganization, modelDefaults);
  router.get("/organizations/model-configurations/v2", requireUser, requireSelectedOrganization, getModelConfig);
  router.put("/organizations/model-configurations/v2", requireUser, requireSelectedOrganization, putModelConfig);
  router.get("/organizations/model-configurations/v2/migration-preview", requireUser, requireSelectedOrganization, modelMigrationPreview);
  router.post("/organizations/model-configurations/v2/migrate", requireUser, requireSelectedOrganization, modelMigration);
  router.get("/organizations/preferences", requireUser, requireSelectedOrganization, getPreferences);
  router.put("/organizations/preferences", requireUser, requireSelectedOrganization, putPreferences);
  router.get("/organizations/telephony-configs", requireUser, requireSelectedOrganization, listTelephonyConfigs);
  router.post("/organizations/telephony-configs", requireUser, requireSelectedOrganization, createTelephonyConfig);
  router.get("/organizations/telephony-configs/:config_id", requireUser, requireSelectedOrganization, getTelephonyConfig);
  router.put("/organizations/telephony-configs/:config_id", requireUser, requireSelectedOrganization, updateTelephonyConfig);
  router.delete("/organizations/telephony-configs/:config_id", requireUser, requireSelectedOrganization, deleteTelephonyConfig);
  router.post("/organizations/telephony-configs/:config_id/set-default-outbound", requireUser, requireSelectedOrganization, setDefaultOutbound);
  router.get("/organizations/telephony-configs/:config_id/phone-numbers", requireUser, requireSelectedOrganization, listPhones);
  router.post("/organizations/telephony-configs/:config_id/phone-numbers", requireUser, requireSelectedOrganization, createPhone);
  router.get("/organizations/telephony-configs/:config_id/phone-numbers/:phone_number_id", requireUser, requireSelectedOrganization, getPhone);
  router.put("/organizations/telephony-configs/:config_id/phone-numbers/:phone_number_id", requireUser, requireSelectedOrganization, updatePhone);
  router.delete("/organizations/telephony-configs/:config_id/phone-numbers/:phone_number_id", requireUser, requireSelectedOrganization, deletePhone);
  router.post("/organizations/telephony-configs/:config_id/phone-numbers/:phone_number_id/set-default-caller", requireUser, requireSelectedOrganization, defaultCaller);
  router.get("/organizations/telephony-config", requireUser, requireSelectedOrganization, legacyGetTelephonyConfig);
  router.post("/organizations/telephony-config", requireUser, requireSelectedOrganization, legacySaveTelephonyConfig);
  router.get("/organizations/langfuse-credentials", requireUser, requireSelectedOrganization, getLangfuse);
  router.post("/organizations/langfuse-credentials", requireUser, requireSelectedOrganization, saveLangfuse);
  router.delete("/organizations/langfuse-credentials", requireUser, requireSelectedOrganization, deleteLangfuse);
  router.get("/organizations/campaign-defaults", requireUser, requireSelectedOrganization, campaignDefaults);
  router.get("/organizations/usage/current-period", requireUser, requireSelectedOrganization, currentUsage);
  router.get("/organizations/usage/mps-credits", requireUser, mpsCredits);
  router.get("/organizations/billing/credits", requireUser, billingCredits);
  router.post("/organizations/usage/mps-credits/purchase-url", requireUser, purchaseUrl);
  router.get("/organizations/usage/runs", requireUser, requireSelectedOrganization, usageRuns);
  router.get("/organizations/usage/runs/report", requireUser, requireSelectedOrganization, usageRunsReport);
  router.get("/organizations/usage/daily-breakdown", requireUser, requireSelectedOrganization, dailyBreakdown);
  router.get("/organizations/reports/daily", requireUser, requireSelectedOrganization, dailyReport);
  router.get("/organizations/reports/workflows", requireUser, requireSelectedOrganization, workflowOptions);
  router.get("/organizations/reports/daily/runs", requireUser, requireSelectedOrganization, dailyRuns);
};
