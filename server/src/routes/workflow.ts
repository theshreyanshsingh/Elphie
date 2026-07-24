import { randomUUID } from "node:crypto";
import type { Request, RequestHandler, Router } from "express";
import { z } from "zod";
import {
  createEmbedToken,
  deactivateEmbedToken,
  getEmbedTokensByWorkflow,
  updateEmbedToken,
  type EmbedTokenRecord
} from "../db/repositories/embedTokens.js";
import {
  countWorkflowRuns,
  countWorkflowsForOrg,
  createWorkflow,
  duplicateWorkflow,
  getCurrentWorkflowDefinition,
  getDraftWorkflowDefinition,
  getWorkflowByIdForOrg,
  getWorkflowTemplate,
  listWorkflowTemplates,
  listWorkflowVersions,
  listWorkflowsForOrg,
  moveWorkflowToFolder,
  objectOrEmpty,
  publishWorkflowDraft,
  saveWorkflowDraft,
  updateWorkflow,
  updateWorkflowStatus,
  type WorkflowDefinitionRecord,
  type WorkflowRecord
} from "../db/repositories/workflows.js";
import {
  createWorkflowRun,
  ensurePublicAccessToken,
  ensureWorkflowRunTextSession,
  getWorkflowRunForOrg,
  getWorkflowRunsByWorkflowForOrg,
  getWorkflowRunTextSessionForOrg,
  TextSessionRevisionConflictError,
  updateWorkflowRun,
  updateWorkflowRunTextSession,
  type WorkflowRunRecord,
  type WorkflowRunTextSessionRecord
} from "../db/repositories/workflowRuns.js";
import { env } from "../config/env.js";
import { HttpError } from "../errors/httpError.js";
import { requireSelectedOrganization, requireUser } from "../middleware/auth.js";
import { createWorkflowViaMps } from "../services/mps/client.js";
import {
  getCurrentStorageBackend,
  getStorageForBackend
} from "../services/storage/storage.js";
import {
  validateWorkflowGraph,
  type ReactFlowDefinition
} from "../services/workflow/workflowGraph.js";
import {
  executeTextChatTurn,
  type TextChatTurn
} from "../services/workflow/textChatRuntime.js";

const anyObject = z.record(z.unknown());

const createWorkflowSchema = z.object({
  name: z.string().min(1),
  workflow_definition: anyObject
});

const createWorkflowTemplateSchema = z.object({
  call_type: z.enum(["inbound", "outbound"]),
  use_case: z.string().min(1),
  activity_description: z.string().min(1)
});

const updateWorkflowSchema = z.object({
  name: z.string().min(1).nullable().optional(),
  workflow_definition: anyObject.nullable().optional(),
  template_context_variables: anyObject.nullable().optional(),
  workflow_configurations: anyObject.nullable().optional()
});

const statusSchema = z.object({
  status: z.enum(["active", "archived"])
});

const folderSchema = z.object({
  folder_id: z.number().int().nullable().optional()
});

const createRunSchema = z.object({
  mode: z.string().min(1),
  name: z.string().min(1)
});

const duplicateTemplateSchema = z.object({
  template_id: z.number().int(),
  workflow_name: z.string().min(1)
});

const ambientNoiseSchema = z.object({
  workflow_id: z.number().int(),
  filename: z.string().min(1),
  mime_type: z.string().default("audio/wav"),
  file_size: z.number().int().positive().max(10_485_760)
});

const createTextSessionSchema = z.object({
  name: z.string().nullable().optional(),
  initial_context: anyObject.nullable().optional(),
  annotations: anyObject.nullable().optional()
});

const appendTextMessageSchema = z.object({
  text: z.string().min(1),
  expected_revision: z.number().int().nullable().optional()
});

const rewindTextSessionSchema = z.object({
  cursor_turn_id: z.string().nullable().optional(),
  expected_revision: z.number().int().nullable().optional()
});

const embedTokenSchema = z.object({
  allowed_domains: z.array(z.string()).nullable().optional(),
  settings: anyObject.nullable().optional(),
  usage_limit: z.number().int().nullable().optional(),
  expires_in_days: z.number().int().nullable().default(30)
});

const selectedOrganizationId = (req: Request): number => {
  const organizationId = req.user?.selectedOrganizationId;
  if (!organizationId) throw new HttpError(400, "No organization selected");
  return organizationId;
};

const requireAuthenticatedUser = (req: Request) => {
  if (!req.user) throw new HttpError(401, "Unauthorized");
  return req.user;
};

const toReactFlowDefinition = (value: unknown): ReactFlowDefinition => {
  const object = objectOrEmpty(value as never);
  return {
    nodes: Array.isArray(object.nodes) ? (object.nodes as ReactFlowDefinition["nodes"]) : [],
    edges: Array.isArray(object.edges) ? (object.edges as ReactFlowDefinition["edges"]) : []
  };
};

const activeDefinitionForWorkflow = async (
  workflow: WorkflowRecord
): Promise<WorkflowDefinitionRecord | null> =>
  (await getDraftWorkflowDefinition(workflow.id)) ??
  (await getCurrentWorkflowDefinition(workflow));

const workflowResponse = async (
  workflow: WorkflowRecord,
  options: { includeRunCount?: boolean } = {}
) => {
  const activeDefinition = await activeDefinitionForWorkflow(workflow);
  const runCount = options.includeRunCount
    ? await countWorkflowRuns(workflow.id)
    : undefined;
  return {
    id: workflow.id,
    name: workflow.name,
    status: workflow.status,
    created_at: workflow.created_at,
    workflow_definition: objectOrEmpty(
      activeDefinition?.workflow_json ?? workflow.workflow_definition
    ),
    current_definition_id: activeDefinition?.id ?? workflow.released_definition_id ?? null,
    template_context_variables: objectOrEmpty(
      activeDefinition?.template_context_variables ?? workflow.template_context_variables
    ),
    call_disposition_codes: objectOrEmpty(workflow.call_disposition_codes),
    total_runs: runCount,
    workflow_configurations: objectOrEmpty(
      activeDefinition?.workflow_configurations ?? workflow.workflow_configurations
    ),
    version_number: activeDefinition?.version_number ?? null,
    version_status: activeDefinition?.status ?? null,
    workflow_uuid: workflow.workflow_uuid
  };
};

const workflowVersionResponse = (version: WorkflowDefinitionRecord) => ({
  id: version.id,
  version_number: version.version_number ?? 0,
  status: version.status,
  created_at: version.created_at,
  published_at: version.published_at,
  workflow_json: objectOrEmpty(version.workflow_json),
  workflow_configurations: objectOrEmpty(version.workflow_configurations),
  template_context_variables: objectOrEmpty(version.template_context_variables)
});

const workflowRunResponse = async (run: WorkflowRunRecord) => {
  const extra = objectOrEmpty(run.extra);
  const hasArtifact =
    Boolean(run.transcript_url) ||
    Boolean(run.recording_url) ||
    Boolean(extra.user_recording_url) ||
    Boolean(extra.bot_recording_url);
  const publicToken = hasArtifact
    ? run.public_access_token ?? (await ensurePublicAccessToken(run.id))
    : run.public_access_token;
  const artifactUrl = (artifactType: string) =>
    publicToken
      ? `${env.backendApiEndpoint}/api/v1/public/download/workflow/${publicToken}/${artifactType}`
      : null;

  return {
    id: run.id,
    workflow_id: run.workflow_id,
    name: run.name,
    mode: run.mode ?? "",
    created_at: run.created_at,
    is_completed: run.is_completed,
    transcript_url: run.transcript_url,
    recording_url: run.recording_url,
    user_recording_url:
      typeof extra.user_recording_url === "string" ? extra.user_recording_url : null,
    bot_recording_url:
      typeof extra.bot_recording_url === "string" ? extra.bot_recording_url : null,
    transcript_public_url: artifactUrl("transcript"),
    recording_public_url: artifactUrl("recording"),
    user_recording_public_url: artifactUrl("user_recording"),
    bot_recording_public_url: artifactUrl("bot_recording"),
    public_access_token: publicToken,
    cost_info: objectOrEmpty(run.cost_info),
    usage_info: objectOrEmpty(run.usage_info),
    definition_id: run.definition_id,
    initial_context: objectOrEmpty(run.initial_context),
    gathered_context: objectOrEmpty(run.gathered_context),
    call_type: run.call_type ?? "outbound",
    logs: objectOrEmpty(run.logs),
    annotations: objectOrEmpty(run.annotations)
  };
};

const textSessionResponse = (session: WorkflowRunTextSessionRecord) => ({
  workflow_run_id: session.workflow_run_id,
  workflow_id: session.workflow_id,
  name: session.name,
  mode: session.mode,
  state: session.state,
  is_completed: session.is_completed,
  revision: session.revision,
  initial_context: objectOrEmpty(session.initial_context),
  gathered_context: objectOrEmpty(session.gathered_context),
  annotations: objectOrEmpty(session.annotations),
  session_data: objectOrEmpty(session.session_data),
  checkpoint: objectOrEmpty(session.checkpoint),
  created_at: session.created_at,
  updated_at: session.updated_at
});

const validateWorkflowOrThrow = (definition: unknown): void => {
  const errors = validateWorkflowGraph(toReactFlowDefinition(definition));
  if (errors.length) {
    throw new HttpError(422, "Workflow validation failed", {
      errors
    });
  }
};

// Mirrors api/services/workflow/trigger_paths.py:regenerate_trigger_uuids — mint
// fresh UUIDs for every trigger node so a template's baked-in paths never collide.
const regenerateTriggerUuids = (
  workflowDefinition: Record<string, unknown>
): Record<string, unknown> => {
  const definition = structuredClone(workflowDefinition);
  const nodes = Array.isArray(definition.nodes) ? definition.nodes : [];
  for (const node of nodes) {
    if (!node || typeof node !== "object") continue;
    const typedNode = node as Record<string, unknown>;
    if (typedNode.type !== "trigger") continue;
    const data =
      typedNode.data && typeof typedNode.data === "object"
        ? (typedNode.data as Record<string, unknown>)
        : {};
    data.trigger_path = randomUUID();
    typedNode.data = data;
  }
  return definition;
};

const validateWorkflow: RequestHandler = async (req, res, next) => {
  try {
    const workflow = await getWorkflowByIdForOrg(
      Number(req.params.workflow_id),
      selectedOrganizationId(req)
    );
    if (!workflow) throw new HttpError(404, `Workflow with id ${req.params.workflow_id} not found`);
    const activeDefinition = await activeDefinitionForWorkflow(workflow);
    validateWorkflowOrThrow(activeDefinition?.workflow_json ?? workflow.workflow_definition);
    res.json({ is_valid: true, errors: [] });
  } catch (err) {
    next(err);
  }
};

const createFromDefinition: RequestHandler = async (req, res, next) => {
  try {
    const user = requireAuthenticatedUser(req);
    const body = createWorkflowSchema.parse(req.body);
    validateWorkflowOrThrow(body.workflow_definition);
    const workflow = await createWorkflow({
      name: body.name,
      workflowDefinition: body.workflow_definition,
      userId: user.id,
      organizationId: selectedOrganizationId(req)
    });
    res.json(await workflowResponse(workflow));
  } catch (err) {
    next(err);
  }
};

const createFromTemplate: RequestHandler = async (req, res, next) => {
  try {
    const user = requireAuthenticatedUser(req);
    const organizationId = selectedOrganizationId(req);
    const body = createWorkflowTemplateSchema.parse(req.body);

    // Match the Python endpoint: MPS generates the full agent graph from the
    // natural-language template. OSS scopes by created_by, hosted by org id.
    const workflowData = await createWorkflowViaMps({
      callType: body.call_type.toUpperCase(),
      useCase: body.use_case,
      activityDescription: body.activity_description,
      ...(env.deploymentMode === "oss"
        ? { createdBy: user.providerId }
        : { organizationId })
    });

    const workflowDefinition = regenerateTriggerUuids(
      objectOrEmpty(workflowData.workflow_definition as never)
    );

    const workflow = await createWorkflow({
      name:
        typeof workflowData.name === "string" && workflowData.name
          ? workflowData.name
          : `${body.use_case} - ${body.call_type}`,
      workflowDefinition,
      userId: user.id,
      organizationId
    });
    res.json(await workflowResponse(workflow));
  } catch (err) {
    next(err);
  }
};

const count: RequestHandler = async (req, res, next) => {
  try {
    res.json(await countWorkflowsForOrg(selectedOrganizationId(req)));
  } catch (err) {
    next(err);
  }
};

const fetchWorkflows: RequestHandler = async (req, res, next) => {
  try {
    res.json(await listWorkflowsForOrg(selectedOrganizationId(req), req.query.status as string | undefined));
  } catch (err) {
    next(err);
  }
};

const fetchWorkflow: RequestHandler = async (req, res, next) => {
  try {
    const workflow = await getWorkflowByIdForOrg(
      Number(req.params.workflow_id),
      selectedOrganizationId(req)
    );
    if (!workflow) throw new HttpError(404, `Workflow with id ${req.params.workflow_id} not found`);
    res.json(await workflowResponse(workflow));
  } catch (err) {
    next(err);
  }
};

const versions: RequestHandler = async (req, res, next) => {
  try {
    const workflow = await getWorkflowByIdForOrg(
      Number(req.params.workflow_id),
      selectedOrganizationId(req)
    );
    if (!workflow) throw new HttpError(404, `Workflow with id ${req.params.workflow_id} not found`);
    const limit = req.query.limit == null ? null : Number(req.query.limit);
    const offset = req.query.offset == null ? 0 : Number(req.query.offset);
    const rows = await listWorkflowVersions({
      workflowId: workflow.id,
      limit,
      offset
    });
    res.json(rows.filter((row) => row.version_number != null).map(workflowVersionResponse));
  } catch (err) {
    next(err);
  }
};

const publish: RequestHandler = async (req, res, next) => {
  try {
    const workflow = await getWorkflowByIdForOrg(
      Number(req.params.workflow_id),
      selectedOrganizationId(req)
    );
    if (!workflow) throw new HttpError(404, `Workflow with id ${req.params.workflow_id} not found`);
    const draft = await getDraftWorkflowDefinition(workflow.id);
    if (!draft) throw new HttpError(400, "No draft to publish");
    validateWorkflowOrThrow(draft.workflow_json);
    const published = await publishWorkflowDraft(workflow.id);
    if (!published) throw new HttpError(400, "No draft to publish");
    res.json({
      id: published.id,
      version_number: published.version_number,
      status: published.status,
      published_at: published.published_at
    });
  } catch (err) {
    next(err);
  }
};

const createDraft: RequestHandler = async (req, res, next) => {
  try {
    const workflow = await getWorkflowByIdForOrg(
      Number(req.params.workflow_id),
      selectedOrganizationId(req)
    );
    if (!workflow) throw new HttpError(404, `Workflow with id ${req.params.workflow_id} not found`);
    const draft = await saveWorkflowDraft({ workflowId: workflow.id });
    res.json(workflowVersionResponse(draft));
  } catch (err) {
    next(err);
  }
};

const summary: RequestHandler = async (req, res, next) => {
  try {
    const workflows = await listWorkflowsForOrg(
      selectedOrganizationId(req),
      req.query.status as string | undefined
    );
    res.json(workflows.map((workflow) => ({ id: workflow.id, name: workflow.name })));
  } catch (err) {
    next(err);
  }
};

const updateStatus: RequestHandler = async (req, res, next) => {
  try {
    const body = statusSchema.parse(req.body);
    const workflow = await updateWorkflowStatus({
      workflowId: Number(req.params.workflow_id),
      organizationId: selectedOrganizationId(req),
      status: body.status
    });
    if (!workflow) throw new HttpError(404, `Workflow with id ${req.params.workflow_id} not found`);
    res.json(await workflowResponse(workflow, { includeRunCount: true }));
  } catch (err) {
    next(err);
  }
};

const moveFolder: RequestHandler = async (req, res, next) => {
  try {
    const body = folderSchema.parse(req.body);
    const workflow = await moveWorkflowToFolder({
      workflowId: Number(req.params.workflow_id),
      organizationId: selectedOrganizationId(req),
      folderId: body.folder_id ?? null
    });
    if (!workflow) throw new HttpError(404, "Workflow or folder not found");
    res.json({
      id: workflow.id,
      name: workflow.name,
      status: workflow.status,
      created_at: workflow.created_at,
      total_runs: await countWorkflowRuns(workflow.id),
      folder_id: workflow.folder_id,
      workflow_uuid: workflow.workflow_uuid
    });
  } catch (err) {
    next(err);
  }
};

const update: RequestHandler = async (req, res, next) => {
  try {
    const body = updateWorkflowSchema.parse(req.body);
    if (body.workflow_definition) validateWorkflowOrThrow(body.workflow_definition);
    const workflow = await updateWorkflow({
      workflowId: Number(req.params.workflow_id),
      organizationId: selectedOrganizationId(req),
      name: body.name,
      workflowDefinition: body.workflow_definition,
      workflowConfigurations: body.workflow_configurations,
      templateContextVariables: body.template_context_variables
    });
    if (!workflow) throw new HttpError(404, `Workflow with id ${req.params.workflow_id} not found`);
    res.json(await workflowResponse(workflow));
  } catch (err) {
    next(err);
  }
};

const duplicate: RequestHandler = async (req, res, next) => {
  try {
    const user = requireAuthenticatedUser(req);
    const workflow = await duplicateWorkflow({
      workflowId: Number(req.params.workflow_id),
      organizationId: selectedOrganizationId(req),
      userId: user.id
    });
    if (!workflow) throw new HttpError(404, `Workflow with id ${req.params.workflow_id} not found`);
    res.json(await workflowResponse(workflow));
  } catch (err) {
    next(err);
  }
};

const createRun: RequestHandler = async (req, res, next) => {
  try {
    const user = requireAuthenticatedUser(req);
    const body = createRunSchema.parse(req.body);
    const run = await createWorkflowRun({
      name: body.name,
      workflowId: Number(req.params.workflow_id),
      mode: body.mode,
      userId: user.id,
      organizationId: selectedOrganizationId(req),
      useDraft: true
    });
    res.json({
      id: run.id,
      workflow_id: run.workflow_id,
      name: run.name,
      mode: run.mode,
      created_at: run.created_at,
      definition_id: run.definition_id,
      initial_context: objectOrEmpty(run.initial_context),
      gathered_context: objectOrEmpty(run.gathered_context)
    });
  } catch (err) {
    next(err);
  }
};

const parseFilters = (value: unknown) => {
  if (typeof value !== "string" || !value) return null;
  const parsed = JSON.parse(value) as unknown;
  if (!Array.isArray(parsed)) throw new HttpError(400, "Invalid filter format");
  return parsed as Array<Record<string, unknown>>;
};

const listRuns: RequestHandler = async (req, res, next) => {
  try {
    const page = Math.max(1, Number(req.query.page ?? 1));
    const limit = Math.min(100, Math.max(1, Number(req.query.limit ?? 50)));
    const filters = parseFilters(req.query.filters);
    const result = await getWorkflowRunsByWorkflowForOrg({
      workflowId: Number(req.params.workflow_id),
      organizationId: selectedOrganizationId(req),
      limit,
      offset: (page - 1) * limit,
      filters: filters as any,
      sortBy: typeof req.query.sort_by === "string" ? req.query.sort_by : null,
      sortOrder: req.query.sort_order === "asc" ? "asc" : "desc"
    });
    res.json({
      runs: await Promise.all(result.runs.map(workflowRunResponse)),
      total_count: result.totalCount,
      page,
      limit,
      total_pages: Math.ceil(result.totalCount / limit),
      applied_filters: filters
    });
  } catch (err) {
    next(err);
  }
};

const getRun: RequestHandler = async (req, res, next) => {
  try {
    const run = await getWorkflowRunForOrg({
      workflowRunId: Number(req.params.run_id),
      workflowId: Number(req.params.workflow_id),
      organizationId: selectedOrganizationId(req)
    });
    if (!run) throw new HttpError(404, "Workflow run not found");
    res.json(await workflowRunResponse(run));
  } catch (err) {
    next(err);
  }
};

const csvEscape = (value: unknown) => `"${String(value ?? "").replaceAll('"', '""')}"`;

const report: RequestHandler = async (req, res, next) => {
  try {
    const workflow = await getWorkflowByIdForOrg(
      Number(req.params.workflow_id),
      selectedOrganizationId(req)
    );
    if (!workflow) throw new HttpError(404, `Workflow with id ${req.params.workflow_id} not found`);
    const result = await getWorkflowRunsByWorkflowForOrg({
      workflowId: workflow.id,
      organizationId: workflow.organization_id,
      limit: 10_000,
      offset: 0,
      sortOrder: "desc"
    });
    const rows = await Promise.all(result.runs.map(workflowRunResponse));
    const headers = ["id", "name", "created_at", "is_completed", "mode", "call_type"];
    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", `attachment; filename="workflow_${workflow.id}_report.csv"`);
    res.send([
      headers.join(","),
      ...rows.map((row) => headers.map((header) => csvEscape((row as any)[header])).join(","))
    ].join("\n"));
  } catch (err) {
    next(err);
  }
};

const templates: RequestHandler = async (_req, res, next) => {
  try {
    const rows = await listWorkflowTemplates();
    res.json(
      rows.map((row) => ({
        id: row.id,
        template_name: row.template_name,
        template_description: row.template_description,
        template_json: objectOrEmpty(row.template_json),
        created_at: row.created_at
      }))
    );
  } catch (err) {
    next(err);
  }
};

const duplicateTemplate: RequestHandler = async (req, res, next) => {
  try {
    const user = requireAuthenticatedUser(req);
    const body = duplicateTemplateSchema.parse(req.body);
    const template = await getWorkflowTemplate(body.template_id);
    if (!template) throw new HttpError(404, `Workflow template with id ${body.template_id} not found`);
    validateWorkflowOrThrow(template.template_json);
    const workflow = await createWorkflow({
      name: body.workflow_name,
      workflowDefinition: objectOrEmpty(template.template_json),
      userId: user.id,
      organizationId: selectedOrganizationId(req)
    });
    res.json(await workflowResponse(workflow));
  } catch (err) {
    next(err);
  }
};

const ambientUploadUrl: RequestHandler = async (req, res, next) => {
  try {
    const organizationId = selectedOrganizationId(req);
    const body = ambientNoiseSchema.parse(req.body);
    const workflow = await getWorkflowByIdForOrg(body.workflow_id, organizationId);
    if (!workflow) throw new HttpError(404, "Workflow not found");
    const sanitized = body.filename.replace(/[^a-zA-Z0-9._-]/g, "_");
    const storageKey = `ambient-noise/${organizationId}/${body.workflow_id}/${randomUUID()}_${sanitized}`;
    const storageBackend = getCurrentStorageBackend();
    const uploadUrl = await getStorageForBackend(storageBackend).getPresignedPutUrl(storageKey, {
      expiration: 1800,
      contentType: body.mime_type,
      maxSize: body.file_size
    });
    if (!uploadUrl) throw new HttpError(500, "Failed to generate upload URL");
    res.json({ upload_url: uploadUrl, storage_key: storageKey, storage_backend: storageBackend });
  } catch (err) {
    next(err);
  }
};

const defaultTextSessionData = () => ({
  turns: [],
  pending_turn: null,
  status: "ready"
});

const defaultCheckpoint = () => ({
  cursor_turn_id: null,
  active_node_id: null
});

const createTextSession: RequestHandler = async (req, res, next) => {
  try {
    const user = requireAuthenticatedUser(req);
    const body = createTextSessionSchema.parse(req.body);
    const run = await createWorkflowRun({
      name: body.name ?? `WR-TEXT-${randomUUID().slice(0, 6).toUpperCase()}`,
      workflowId: Number(req.params.workflow_id),
      mode: "textchat",
      userId: user.id,
      organizationId: selectedOrganizationId(req),
      initialContext: body.initial_context ?? {},
      useDraft: true
    });
    await updateWorkflowRun(run.id, {
      annotations: {
        tester: { source: "workflow_editor", modality: "text" },
        ...objectOrEmpty(body.annotations)
      }
    });
    const session = await ensureWorkflowRunTextSession({
      workflowRunId: run.id,
      sessionData: defaultTextSessionData(),
      checkpoint: defaultCheckpoint()
    });
    res.json(textSessionResponse(session));
  } catch (err) {
    next(err);
  }
};

const loadTextSession = async (req: Request): Promise<WorkflowRunTextSessionRecord> => {
  const session = await getWorkflowRunTextSessionForOrg({
    workflowRunId: Number(req.params.run_id),
    workflowId: Number(req.params.workflow_id),
    organizationId: selectedOrganizationId(req)
  });
  if (!session) throw new HttpError(404, "Text chat session not found");
  if (session.mode !== "textchat") {
    throw new HttpError(400, "Workflow run is not a text chat session");
  }
  return session;
};

const getTextSession: RequestHandler = async (req, res, next) => {
  try {
    res.json(textSessionResponse(await loadTextSession(req)));
  } catch (err) {
    next(err);
  }
};

const appendTextMessage: RequestHandler = async (req, res, next) => {
  try {
    const body = appendTextMessageSchema.parse(req.body);
    const session = await loadTextSession(req);
    const organizationId = selectedOrganizationId(req);
    const workflow = await getWorkflowByIdForOrg(session.workflow_id, organizationId);
    if (!workflow) throw new HttpError(404, "Workflow not found");
    const definition = await getCurrentWorkflowDefinition(workflow);
    const sessionData = objectOrEmpty(session.session_data);
    const turns = Array.isArray(sessionData.turns)
      ? (sessionData.turns as TextChatTurn[])
      : [];
    const turnId = randomUUID();
    const userTurn: TextChatTurn = {
      id: turnId,
      role: "user",
      text: body.text,
      created_at: new Date().toISOString()
    };
    const runtimeResult = executeTextChatTurn({
      userText: body.text,
      priorTurns: turns,
      workflowName: workflow.name,
      workflowRunId: session.workflow_run_id,
      workflowId: session.workflow_id,
      workflowDefinition:
        (definition?.workflow_json as Record<string, unknown> | null | undefined) ??
        (workflow.workflow_definition as Record<string, unknown> | null | undefined) ??
        null,
      runtimeContext: {
        ...objectOrEmpty(session.initial_context),
        ...objectOrEmpty(session.gathered_context),
        annotations: objectOrEmpty(session.annotations)
      }
    });
    const nextSessionData = {
      ...sessionData,
      turns: [...turns, userTurn, runtimeResult.assistantTurn],
      pending_turn: null,
      status: "ready"
    };
    const updated = await updateWorkflowRunTextSession({
      workflowRunId: session.workflow_run_id,
      organizationId,
      sessionData: nextSessionData,
      checkpoint: { ...objectOrEmpty(session.checkpoint), cursor_turn_id: turnId },
      expectedRevision: body.expected_revision
    });
    if (!updated) throw new HttpError(404, "Text chat session not found");
    await updateWorkflowRun(session.workflow_run_id, {
      state: runtimeResult.completed ? "completed" : "running",
      is_completed: runtimeResult.completed ? true : session.is_completed,
      gathered_context: {
        ...objectOrEmpty(session.gathered_context),
        ...runtimeResult.gatheredContextPatch
      }
    });
    res.json(textSessionResponse(updated));
  } catch (err) {
    if (err instanceof TextSessionRevisionConflictError) {
      next(new HttpError(409, "Text chat session revision conflict", {
        expected_revision: err.expectedRevision,
        actual_revision: err.actualRevision
      }));
      return;
    }
    next(err);
  }
};

const rewindTextSession: RequestHandler = async (req, res, next) => {
  try {
    const body = rewindTextSessionSchema.parse(req.body);
    const session = await loadTextSession(req);
    const sessionData = objectOrEmpty(session.session_data);
    const turns = Array.isArray(sessionData.turns)
      ? (sessionData.turns as Array<Record<string, unknown>>)
      : [];
    const index =
      body.cursor_turn_id == null
        ? -1
        : turns.findIndex((turn) => turn.id === body.cursor_turn_id);
    if (body.cursor_turn_id != null && index === -1) {
      throw new HttpError(404, "Text chat turn not found");
    }
    const updated = await updateWorkflowRunTextSession({
      workflowRunId: session.workflow_run_id,
      organizationId: selectedOrganizationId(req),
      sessionData: {
        ...sessionData,
        turns: index === -1 ? [] : turns.slice(0, index + 1),
        pending_turn: null,
        status: "ready"
      },
      checkpoint: { ...objectOrEmpty(session.checkpoint), cursor_turn_id: body.cursor_turn_id ?? null },
      expectedRevision: body.expected_revision
    });
    if (!updated) throw new HttpError(404, "Text chat session not found");
    res.json(textSessionResponse(updated));
  } catch (err) {
    if (err instanceof TextSessionRevisionConflictError) {
      next(new HttpError(409, "Text chat session revision conflict", {
        expected_revision: err.expectedRevision,
        actual_revision: err.actualRevision
      }));
      return;
    }
    next(err);
  }
};

const embedScript = (token: EmbedTokenRecord): string =>
  `<!-- Dograh Voice Widget -->\n<script src="${env.uiAppUrl.replace(/\/+$/, "")}/embed/dograh-widget.js?token=${token.token}&environment=${env.environment}&apiEndpoint=${env.backendApiEndpoint}" async></script>`;

const embedResponse = (token: EmbedTokenRecord) => ({
  id: token.id,
  token: token.token,
  allowed_domains: Array.isArray(token.allowed_domains) ? token.allowed_domains : [],
  settings: objectOrEmpty(token.settings),
  is_active: token.is_active,
  usage_count: token.usage_count,
  usage_limit: token.usage_limit,
  expires_at: token.expires_at,
  created_at: token.created_at,
  embed_script: embedScript(token)
});

const getEmbedToken: RequestHandler = async (req, res, next) => {
  try {
    const organizationId = selectedOrganizationId(req);
    const workflow = await getWorkflowByIdForOrg(Number(req.params.workflow_id), organizationId);
    if (!workflow) throw new HttpError(404, `Workflow with id ${req.params.workflow_id} not found`);
    const tokens = await getEmbedTokensByWorkflow({
      workflowId: workflow.id,
      organizationId,
      activeOnly: true
    });
    res.json(tokens[0] ? embedResponse(tokens[0]) : null);
  } catch (err) {
    next(err);
  }
};

const createOrUpdateEmbedToken: RequestHandler = async (req, res, next) => {
  try {
    const user = requireAuthenticatedUser(req);
    const organizationId = selectedOrganizationId(req);
    const workflow = await getWorkflowByIdForOrg(Number(req.params.workflow_id), organizationId);
    if (!workflow) throw new HttpError(404, `Workflow with id ${req.params.workflow_id} not found`);
    const body = embedTokenSchema.parse(req.body);
    const expiresAt = body.expires_in_days
      ? new Date(Date.now() + body.expires_in_days * 24 * 60 * 60 * 1000)
      : null;
    const existing = await getEmbedTokensByWorkflow({
      workflowId: workflow.id,
      organizationId,
      activeOnly: false
    });
    const token = existing[0]
      ? await updateEmbedToken({
          tokenId: existing[0].id,
          organizationId,
          allowedDomains: body.allowed_domains,
          settings: body.settings,
          usageLimit: body.usage_limit,
          expiresAt,
          isActive: true
        })
      : await createEmbedToken({
          workflowId: workflow.id,
          organizationId,
          createdBy: user.id,
          allowedDomains: body.allowed_domains,
          settings: body.settings,
          usageLimit: body.usage_limit,
          expiresAt
        });
    if (!token) throw new HttpError(500, "Failed to save embed token");
    res.json(embedResponse(token));
  } catch (err) {
    next(err);
  }
};

const deactivateToken: RequestHandler = async (req, res, next) => {
  try {
    const organizationId = selectedOrganizationId(req);
    const workflow = await getWorkflowByIdForOrg(Number(req.params.workflow_id), organizationId);
    if (!workflow) throw new HttpError(404, `Workflow with id ${req.params.workflow_id} not found`);
    const tokens = await getEmbedTokensByWorkflow({
      workflowId: workflow.id,
      organizationId,
      activeOnly: true
    });
    if (!tokens[0]) throw new HttpError(404, "No active embed token found for this workflow");
    const success = await deactivateEmbedToken({
      tokenId: tokens[0].id,
      organizationId
    });
    if (!success) throw new HttpError(500, "Failed to deactivate embed token");
    res.json({ message: "Embed token deactivated successfully" });
  } catch (err) {
    next(err);
  }
};

export const registerWorkflowRoutes = (router: Router): void => {
  router.post("/workflow/create/definition", requireUser, requireSelectedOrganization, createFromDefinition);
  router.post("/workflow/create/template", requireUser, requireSelectedOrganization, createFromTemplate);
  router.get("/workflow/count", requireUser, requireSelectedOrganization, count);
  router.get("/workflow/fetch", requireUser, requireSelectedOrganization, fetchWorkflows);
  router.get("/workflow/summary", requireUser, requireSelectedOrganization, summary);
  router.get("/workflow/templates", templates);
  router.post("/workflow/templates/duplicate", requireUser, requireSelectedOrganization, duplicateTemplate);
  router.post("/workflow/ambient-noise/upload-url", requireUser, requireSelectedOrganization, ambientUploadUrl);

  router.get("/workflow/fetch/:workflow_id", requireUser, requireSelectedOrganization, fetchWorkflow);
  router.post("/workflow/:workflow_id/validate", requireUser, requireSelectedOrganization, validateWorkflow);
  router.get("/workflow/:workflow_id/versions", requireUser, requireSelectedOrganization, versions);
  router.post("/workflow/:workflow_id/publish", requireUser, requireSelectedOrganization, publish);
  router.post("/workflow/:workflow_id/create-draft", requireUser, requireSelectedOrganization, createDraft);
  router.put("/workflow/:workflow_id/status", requireUser, requireSelectedOrganization, updateStatus);
  router.put("/workflow/:workflow_id/folder", requireUser, requireSelectedOrganization, moveFolder);
  router.put("/workflow/:workflow_id", requireUser, requireSelectedOrganization, update);
  router.post("/workflow/:workflow_id/duplicate", requireUser, requireSelectedOrganization, duplicate);
  router.get("/workflow/:workflow_id/runs", requireUser, requireSelectedOrganization, listRuns);
  router.post("/workflow/:workflow_id/runs", requireUser, requireSelectedOrganization, createRun);
  router.get("/workflow/:workflow_id/runs/:run_id", requireUser, requireSelectedOrganization, getRun);
  router.get("/workflow/:workflow_id/report", requireUser, requireSelectedOrganization, report);
  router.post("/workflow/:workflow_id/text-chat/sessions", requireUser, requireSelectedOrganization, createTextSession);
  router.get("/workflow/:workflow_id/text-chat/sessions/:run_id", requireUser, requireSelectedOrganization, getTextSession);
  router.post("/workflow/:workflow_id/text-chat/sessions/:run_id/messages", requireUser, requireSelectedOrganization, appendTextMessage);
  router.post("/workflow/:workflow_id/text-chat/sessions/:run_id/rewind", requireUser, requireSelectedOrganization, rewindTextSession);
  router.get("/workflow/:workflow_id/embed-token", requireUser, requireSelectedOrganization, getEmbedToken);
  router.post("/workflow/:workflow_id/embed-token", requireUser, requireSelectedOrganization, createOrUpdateEmbedToken);
  router.delete("/workflow/:workflow_id/embed-token", requireUser, requireSelectedOrganization, deactivateToken);
};
