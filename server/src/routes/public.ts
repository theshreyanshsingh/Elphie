import crypto from "node:crypto";
import type { Request, RequestHandler, Response, Router } from "express";
import { z } from "zod";
import { validateApiKey } from "../db/repositories/apiKeys.js";
import { getAgentTriggerByPath } from "../db/repositories/agentTriggers.js";
import {
  createEmbedSession,
  getEmbedSessionByToken,
  getEmbedTokenById,
  getEmbedTokenByToken,
  incrementEmbedTokenUsage,
  jsonObjectOrEmpty,
  stringArrayOrEmpty,
  type EmbedTokenRecord
} from "../db/repositories/embedTokens.js";
import {
  getDefaultTelephonyConfiguration,
  getTelephonyConfigurationForOrg,
  listPhoneNumbersForConfig
} from "../db/repositories/telephonyConfigurations.js";
import {
  createWorkflowRun,
  getWorkflowRunByPublicToken,
  updateWorkflowRun
} from "../db/repositories/workflowRuns.js";
import {
  getWorkflowByIdForOrg,
  getWorkflowByUuidForOrg,
  getWorkflowDefinitionForExecution,
  objectOrEmpty,
  type WorkflowRecord
} from "../db/repositories/workflows.js";
import { env } from "../config/env.js";
import { HttpError } from "../errors/httpError.js";
import {
  getRecordingStorageBackend,
  getRecordingStorageKey
} from "../services/recordingArtifacts.js";
import { getStorageForBackend } from "../services/storage/storage.js";
import { initiateOutboundCall } from "../services/telephony/outbound.js";
import { generateTurnCredentials } from "../services/turn/credentials.js";

const EMBED_CORS_ALLOW_HEADERS = "Content-Type, Origin";
const EMBED_CORS_MAX_AGE = "86400";

const initEmbedSchema = z.object({
  token: z.string().min(1),
  context_variables: z.record(z.unknown()).nullable().optional()
});

const triggerCallSchema = z.object({
  phone_number: z.string().min(1),
  initial_context: z.record(z.unknown()).nullable().optional(),
  telephony_configuration_id: z.number().int().nullable().optional()
});

const inlineQuerySchema = z.object({
  inline: z
    .union([z.boolean(), z.string()])
    .optional()
    .transform((value) => value === true || value === "true")
});

export const parseOriginHostPort = (
  value: string
): { host: string; port: string | null } => {
  let candidate = value.trim().toLowerCase();
  if (!candidate) {
    return { host: "", port: null };
  }
  if (!candidate.includes("://") && !candidate.startsWith("//")) {
    candidate = `//${candidate}`;
  }

  try {
    const parsed = new URL(candidate, "http://placeholder.invalid");
    return {
      host: parsed.hostname.replace(/\.$/, ""),
      port: parsed.port || null
    };
  } catch {
    return { host: "", port: null };
  }
};

const normalizeWww = (domain: string): [string, string] =>
  domain.startsWith("www.") ? [domain, domain.slice(4)] : [domain, `www.${domain}`];

export const validateOrigin = (origin: string, allowedDomains: string[]): boolean => {
  if (allowedDomains.length === 0) {
    return true;
  }

  const { host, port } = parseOriginHostPort(origin);
  if (!host) {
    return false;
  }

  const hostVariants = normalizeWww(host);
  for (const rawAllowed of allowedDomains) {
    const allowed = String(rawAllowed).trim().toLowerCase();
    if (allowed === "*") {
      return true;
    }

    const { host: allowedHost, port: allowedPort } = parseOriginHostPort(allowed);
    if (!allowedHost) {
      continue;
    }
    if (allowedPort !== null && allowedPort !== port) {
      continue;
    }

    if (allowedHost.startsWith("*.")) {
      const base = allowedHost.slice(2);
      if (host === base || host.endsWith(`.${base}`)) {
        return true;
      }
      continue;
    }

    const allowedVariants = normalizeWww(allowedHost);
    if (
      hostVariants.some((variant) => allowedVariants.includes(variant)) ||
      allowedVariants.some((variant) => hostVariants.includes(variant))
    ) {
      return true;
    }
  }

  return false;
};

const getRequestOrigin = (req: Request): string =>
  req.header("origin") ?? req.header("referer") ?? "";

const setEmbedCorsHeaders = (
  res: Response,
  origin: string,
  methods: string
): void => {
  res.setHeader("Access-Control-Allow-Origin", origin);
  res.setHeader("Access-Control-Allow-Methods", methods);
  res.setHeader("Access-Control-Allow-Headers", EMBED_CORS_ALLOW_HEADERS);
  res.setHeader("Access-Control-Max-Age", EMBED_CORS_MAX_AGE);
  const vary = res.getHeader("Vary");
  if (!vary) {
    res.setHeader("Vary", "Origin");
  } else if (!String(vary).toLowerCase().split(",").map((item) => item.trim()).includes("origin")) {
    res.setHeader("Vary", `${vary}, Origin`);
  }
};

const isExpired = (value: Date | string | null): boolean =>
  Boolean(value && new Date(value).getTime() < Date.now());

const unknownObjectOrEmpty = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};

const ensureUsableEmbedToken = (
  embedToken: EmbedTokenRecord | null,
  origin: string,
  options: { checkExpiration?: boolean; checkUsage?: boolean } = {}
): EmbedTokenRecord => {
  if (!embedToken) {
    throw new HttpError(404, "Invalid embed token");
  }
  if (!embedToken.is_active) {
    throw new HttpError(403, "Embed token is inactive");
  }
  if ((options.checkExpiration ?? true) && isExpired(embedToken.expires_at)) {
    throw new HttpError(403, "Embed token has expired");
  }
  if (
    options.checkUsage &&
    embedToken.usage_limit &&
    embedToken.usage_count >= embedToken.usage_limit
  ) {
    throw new HttpError(403, "Embed token usage limit exceeded");
  }
  if (!validateOrigin(origin, stringArrayOrEmpty(embedToken.allowed_domains))) {
    throw new HttpError(403, `Domain not allowed: ${origin}`);
  }
  return embedToken;
};

const initializeEmbedSession: RequestHandler = async (req, res, next) => {
  try {
    const body = initEmbedSchema.parse(req.body);
    const origin = getRequestOrigin(req);
    const embedToken = ensureUsableEmbedToken(
      await getEmbedTokenByToken(body.token),
      origin,
      { checkUsage: true }
    );

    if (origin) {
      setEmbedCorsHeaders(res, origin, "POST, OPTIONS");
    }

    const workflowRun = await createWorkflowRun({
      name: `Embed Run - ${new Date().toISOString()}`,
      workflowId: embedToken.workflow_id,
      mode: "smallwebrtc",
      userId: embedToken.created_by,
      organizationId: embedToken.organization_id,
      initialContext: body.context_variables ?? null
    });

    const sessionToken = `emb_session_${crypto.randomBytes(32).toString("base64url")}`;
    await createEmbedSession({
      sessionToken,
      embedTokenId: embedToken.id,
      workflowRunId: workflowRun.id,
      clientIp: req.ip ?? null,
      userAgent: (req.header("user-agent") ?? "").slice(0, 500),
      origin: origin.slice(0, 255),
      expiresAt: new Date(Date.now() + 60 * 60 * 1000)
    });
    await incrementEmbedTokenUsage(embedToken.id);

    res.json({
      session_token: sessionToken,
      workflow_run_id: workflowRun.id,
      config: {
        workflow_id: embedToken.workflow_id,
        workflow_run_id: workflowRun.id,
        ...jsonObjectOrEmpty(embedToken.settings)
      }
    });
  } catch (err) {
    next(err);
  }
};

const optionsInit: RequestHandler = (req, res) => {
  setEmbedCorsHeaders(res, req.header("origin") ?? "*", "POST, OPTIONS");
  res.status(200).end();
};

const optionsConfig: RequestHandler = async (req, res, next) => {
  try {
    const origin = req.header("origin") ?? "";
    ensureUsableEmbedToken(
      await getEmbedTokenByToken(String(req.params.token)),
      origin,
      { checkUsage: false }
    );
    setEmbedCorsHeaders(res, origin, "GET, OPTIONS");
    res.status(200).end();
  } catch (err) {
    next(err);
  }
};

const getEmbedConfig: RequestHandler = async (req, res, next) => {
  try {
    const origin = getRequestOrigin(req);
    const embedToken = ensureUsableEmbedToken(
      await getEmbedTokenByToken(String(req.params.token)),
      origin,
      { checkUsage: false, checkExpiration: false }
    );
    if (origin) {
      setEmbedCorsHeaders(res, origin, "GET, OPTIONS");
    }
    const settings = jsonObjectOrEmpty(embedToken.settings);
    res.json({
      workflow_id: embedToken.workflow_id,
      settings,
      theme: settings.theme ?? "light",
      position: settings.position ?? "bottom-right",
      button_text: settings.buttonText ?? "Start Voice Call",
      button_color: settings.buttonColor ?? "#3B82F6",
      size: settings.size ?? "medium",
      auto_start: settings.autoStart ?? false
    });
  } catch (err) {
    next(err);
  }
};

const getEmbedSessionAndToken = async (
  sessionToken: string,
  origin: string
): Promise<EmbedTokenRecord> => {
  const session = await getEmbedSessionByToken(sessionToken);
  if (!session) {
    throw new HttpError(404, "Invalid session token");
  }
  if (isExpired(session.expires_at)) {
    throw new HttpError(403, "Session expired");
  }
  const embedToken = await getEmbedTokenById(session.embed_token_id);
  if (!embedToken) {
    throw new HttpError(404, "Invalid embed token");
  }
  if (!validateOrigin(origin, stringArrayOrEmpty(embedToken.allowed_domains))) {
    throw new HttpError(403, `Domain not allowed: ${origin}`);
  }
  return embedToken;
};

const getPublicTurnCredentials: RequestHandler = async (req, res, next) => {
  try {
    const origin = getRequestOrigin(req);
    const sessionToken = String(req.params.session_token);
    await getEmbedSessionAndToken(sessionToken, origin);
    if (origin) {
      setEmbedCorsHeaders(res, origin, "GET, OPTIONS");
    }
    if (!env.turnSecret) {
      throw new HttpError(503, "TURN server not configured");
    }
    res.json(generateTurnCredentials(`embed:${sessionToken.slice(0, 16)}`));
  } catch (err) {
    next(err);
  }
};

const optionsTurnCredentials: RequestHandler = async (req, res, next) => {
  try {
    const origin = req.header("origin") ?? "";
    await getEmbedSessionAndToken(String(req.params.session_token), origin);
    setEmbedCorsHeaders(res, origin, "GET, OPTIONS");
    res.status(200).end();
  } catch (err) {
    next(err);
  }
};

type ResolvedAgentTarget = {
  workflow: WorkflowRecord;
  organizationId: number;
  identifierType: "trigger_path" | "workflow_uuid";
  identifierValue: string;
};

export const triggerExistsInWorkflow = (
  workflowDefinition: unknown,
  triggerPath: string
): boolean => {
  const nodes = unknownObjectOrEmpty(workflowDefinition).nodes;
  if (!Array.isArray(nodes)) {
    return false;
  }
  return nodes.some((node) => {
    if (!node || typeof node !== "object" || Array.isArray(node)) {
      return false;
    }
    const record = node as Record<string, unknown>;
    const data = unknownObjectOrEmpty(record.data);
    return record.type === "trigger" && data.trigger_path === triggerPath;
  });
};

const ensureWorkflowIsActive = (workflow: WorkflowRecord): void => {
  if (workflow.status !== "active") {
    throw new HttpError(404, "Workflow is not active");
  }
};

const getExecutionUserId = (workflow: WorkflowRecord): number => {
  if (!workflow.user_id) {
    throw new HttpError(409, "Workflow has no execution owner");
  }
  return workflow.user_id;
};

const resolveTriggerTarget = async (
  triggerPath: string,
  organizationId: number,
  options: { useDraft: boolean }
): Promise<ResolvedAgentTarget> => {
  const trigger = await getAgentTriggerByPath(triggerPath);
  if (!trigger) {
    throw new HttpError(404, "Agent trigger not found");
  }
  if (trigger.organization_id !== organizationId) {
    throw new HttpError(403, "Access denied");
  }
  const workflow = await getWorkflowByIdForOrg(trigger.workflow_id, organizationId);
  if (!workflow) {
    throw new HttpError(404, "Workflow not found");
  }
  ensureWorkflowIsActive(workflow);
  const definition = await getWorkflowDefinitionForExecution(workflow, options);
  if (!definition) {
    throw new HttpError(404, "Workflow has no published definition");
  }
  if (!triggerExistsInWorkflow(definition.workflow_json, triggerPath)) {
    throw new HttpError(404, "Trigger not found in the selected Agent");
  }
  return {
    workflow,
    organizationId,
    identifierType: "trigger_path",
    identifierValue: triggerPath
  };
};

const resolveWorkflowUuidTarget = async (
  workflowUuid: string,
  organizationId: number,
  options: { useDraft: boolean }
): Promise<ResolvedAgentTarget> => {
  const workflow = await getWorkflowByUuidForOrg(workflowUuid, organizationId);
  if (!workflow) {
    throw new HttpError(404, "Workflow not found");
  }
  ensureWorkflowIsActive(workflow);
  const definition = await getWorkflowDefinitionForExecution(workflow, options);
  if (!definition) {
    throw new HttpError(404, "Workflow has no published definition");
  }
  return {
    workflow,
    organizationId,
    identifierType: "workflow_uuid",
    identifierValue: workflowUuid
  };
};

const executeResolvedTarget = async (
  target: ResolvedAgentTarget,
  body: z.infer<typeof triggerCallSchema>,
  options: {
    useDraft: boolean;
    apiKeyId: number;
    apiKeyCreatedBy: number | null;
  }
) => {
  const executionUserId = getExecutionUserId(target.workflow);
  const telephonyConfiguration =
    body.telephony_configuration_id != null
      ? await getTelephonyConfigurationForOrg(
          body.telephony_configuration_id,
          target.organizationId
        )
      : await getDefaultTelephonyConfiguration(target.organizationId);

  if (!telephonyConfiguration) {
    throw new HttpError(
      body.telephony_configuration_id != null ? 404 : 400,
      body.telephony_configuration_id != null
        ? "Telephony configuration not found"
        : "Telephony provider not configured for this organization"
    );
  }

  const workflowRunName = `WR-${options.useDraft ? "TEST" : "API"}-${crypto.randomInt(1000, 10000)}`;
  const initialContext = {
    provider: telephonyConfiguration.provider,
    phone_number: body.phone_number,
    trigger_mode: options.useDraft ? "test" : "production",
    telephony_configuration_id: telephonyConfiguration.id,
    agent_identifier: target.identifierValue,
    agent_identifier_type: target.identifierType,
    workflow_uuid: target.workflow.workflow_uuid,
    ...(target.identifierType === "trigger_path"
      ? { agent_uuid: target.identifierValue }
      : {}),
    api_key_id: options.apiKeyId,
    ...(options.apiKeyCreatedBy != null
      ? { api_key_created_by: options.apiKeyCreatedBy }
      : {}),
    ...(body.initial_context ?? {})
  };

  const workflowRun = await createWorkflowRun({
    name: workflowRunName,
    workflowId: target.workflow.id,
    mode: telephonyConfiguration.provider,
    userId: executionUserId,
    organizationId: target.organizationId,
    useDraft: options.useDraft,
    initialContext
  });

  const outbound = await initiateOutboundCall({
    configuration: telephonyConfiguration,
    phoneNumbers: await listPhoneNumbersForConfig(telephonyConfiguration.id),
    to: body.phone_number,
    workflowRunId: workflowRun.id,
    workflowId: target.workflow.id,
    userId: executionUserId
  });

  await updateWorkflowRun(workflowRun.id, {
    state: "running",
    gathered_context: {
      ...objectOrEmpty(workflowRun.gathered_context),
      call_id: outbound.provider_call_id,
      provider_call_id: outbound.provider_call_id,
      from_number: outbound.from_number,
      to_number: outbound.to_number,
      provider: outbound.provider,
      telephony_configuration_id: telephonyConfiguration.id,
      outbound_call_status: outbound.status
    }
  });

  return {
    status: outbound.status,
    workflow_run_id: workflowRun.id,
    workflow_run_name: workflowRunName,
    provider: outbound.provider,
    provider_call_id: outbound.provider_call_id,
    from_number: outbound.from_number,
    to_number: outbound.to_number
  };
};

const initiatePublicAgent =
  (
    options: {
      useDraft: boolean;
      resolveTarget: (
        identifier: string,
        organizationId: number,
        options: { useDraft: boolean }
      ) => Promise<ResolvedAgentTarget>;
      paramName: "uuid" | "workflow_uuid";
    }
  ): RequestHandler =>
  async (req, res, next) => {
    try {
      const xApiKey = req.header("X-API-Key");
      if (!xApiKey) {
        throw new HttpError(422, "X-API-Key header is required");
      }
      const apiKey = await validateApiKey(xApiKey);
      if (!apiKey) {
        throw new HttpError(401, "Invalid API key");
      }
      const body = triggerCallSchema.parse(req.body);
      const target = await options.resolveTarget(
        String(req.params[options.paramName]),
        apiKey.organization_id,
        { useDraft: options.useDraft }
      );
      res.json(
        await executeResolvedTarget(target, body, {
          useDraft: options.useDraft,
          apiKeyId: apiKey.id,
          apiKeyCreatedBy: apiKey.created_by
        })
      );
    } catch (err) {
      next(err);
    }
  };

export const resolveWorkflowArtifact = (
  workflowRun: Awaited<ReturnType<typeof getWorkflowRunByPublicToken>>,
  artifactType: string
): { filePath: string; storageBackend: string | null } => {
  if (!workflowRun) {
    throw new HttpError(404, "Invalid or expired token");
  }

  if (artifactType === "recording") {
    if (!workflowRun.recording_url) {
      throw new HttpError(404, "No recording available for this workflow run");
    }
    return {
      filePath: workflowRun.recording_url,
      storageBackend: workflowRun.storage_backend
    };
  }

  if (artifactType === "transcript") {
    if (!workflowRun.transcript_url) {
      throw new HttpError(404, "No transcript available for this workflow run");
    }
    return {
      filePath: workflowRun.transcript_url,
      storageBackend: workflowRun.storage_backend
    };
  }

  if (artifactType === "user_recording" || artifactType === "bot_recording") {
    const track = artifactType === "user_recording" ? "user" : "bot";
    const filePath = getRecordingStorageKey(workflowRun.extra, track);
    if (!filePath) {
      throw new HttpError(404, `No ${artifactType} available for this workflow run`);
    }
    return {
      filePath,
      storageBackend:
        getRecordingStorageBackend(workflowRun.extra, track) ??
        workflowRun.storage_backend
    };
  }

  throw new HttpError(400, "Unsupported artifact type");
};

const downloadWorkflowArtifact: RequestHandler = async (req, res, next) => {
  try {
    const query = inlineQuerySchema.parse(req.query);
    const workflowRun = await getWorkflowRunByPublicToken(String(req.params.token));
    const artifact = resolveWorkflowArtifact(
      workflowRun,
      String(req.params.artifact_type)
    );
    const signedUrl = await getStorageForBackend(
      artifact.storageBackend
    ).getSignedUrl(artifact.filePath, {
      expiration: 3600,
      forceInline: query.inline
    });
    if (!signedUrl) {
      throw new HttpError(500, "Failed to generate download URL");
    }
    res.redirect(302, signedUrl);
  } catch (err) {
    next(err);
  }
};

export const registerPublicRoutes = (router: Router): void => {
  router.post("/public/embed/init", initializeEmbedSession);
  router.options("/public/embed/init", optionsInit);
  router.options("/public/embed/config/:token", optionsConfig);
  router.get("/public/embed/config/:token", getEmbedConfig);
  router.get(
    "/public/embed/turn-credentials/:session_token",
    getPublicTurnCredentials
  );
  router.options(
    "/public/embed/turn-credentials/:session_token",
    optionsTurnCredentials
  );

  router.post(
    "/public/agent/:uuid",
    initiatePublicAgent({
      useDraft: false,
      resolveTarget: resolveTriggerTarget,
      paramName: "uuid"
    })
  );
  router.post(
    "/public/agent/test/:uuid",
    initiatePublicAgent({
      useDraft: true,
      resolveTarget: resolveTriggerTarget,
      paramName: "uuid"
    })
  );
  router.post(
    "/public/agent/workflow/:workflow_uuid",
    initiatePublicAgent({
      useDraft: false,
      resolveTarget: resolveWorkflowUuidTarget,
      paramName: "workflow_uuid"
    })
  );
  router.post(
    "/public/agent/test/workflow/:workflow_uuid",
    initiatePublicAgent({
      useDraft: true,
      resolveTarget: resolveWorkflowUuidTarget,
      paramName: "workflow_uuid"
    })
  );

  router.get("/public/download/workflow/:token/:artifact_type", downloadWorkflowArtifact);
};
