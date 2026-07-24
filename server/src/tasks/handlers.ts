import fs from "node:fs/promises";
import path from "node:path";
import { sql } from "kysely";
import { db } from "../db/database.js";
import type { JsonValue } from "../db/types.js";
import { getStorageForBackend, getCurrentStorageBackend } from "../services/storage/storage.js";
import { getWorkflowById, getWorkflowDefinitionForExecution, objectOrEmpty } from "../db/repositories/workflows.js";
import { getWorkflowRunById, updateWorkflowRun } from "../db/repositories/workflowRuns.js";
import { nodeTypes } from "../services/workflow/nodeTypes.js";
import { renderTemplate } from "../services/workflow/templateRenderer.js";
import { functionNames, type FunctionName } from "./functionNames.js";

export type TaskHandler = (...args: unknown[]) => Promise<TaskResult>;

export type TaskResult = {
  status: "completed" | "skipped" | "failed";
  task: FunctionName;
  detail?: string;
  [key: string]: unknown;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value && typeof value === "object" && !Array.isArray(value));

const numberAt = (args: unknown[], index: number): number | null => {
  const value = args[index];
  const numeric = typeof value === "number" ? value : Number(value);
  return Number.isFinite(numeric) ? numeric : null;
};

const pythonArgs = (args: unknown[]): unknown[] =>
  isRecord(args[0]) && numberAt(args, 1) != null ? args.slice(1) : args;

const skipped = (task: FunctionName, detail: string): TaskResult => ({
  status: "skipped",
  task,
  detail
});

const failed = (task: FunctionName, error: unknown): TaskResult => ({
  status: "failed",
  task,
  detail: error instanceof Error ? error.message : String(error)
});

const fileExists = async (filePath: string): Promise<boolean> => {
  try {
    const stat = await fs.stat(filePath);
    return stat.isFile();
  } catch {
    return false;
  }
};

const removeFileIfPresent = async (filePath: string): Promise<void> => {
  try {
    await fs.unlink(filePath);
  } catch {
    // Python best-effort cleanup ignores missing temp files.
  }
};

const uploadTempFile = async (input: {
  localPath: string;
  storageKey: string;
  contentType: string;
}): Promise<boolean> => {
  if (!(await fileExists(input.localPath))) {
    return false;
  }
  try {
    return await getStorageForBackend(getCurrentStorageBackend()).uploadFile(
      input.localPath,
      input.storageKey,
      { contentType: input.contentType }
    );
  } finally {
    await removeFileIfPresent(input.localPath);
  }
};

const mergeJsonObject = (
  value: JsonValue | null | undefined,
  patch: Record<string, unknown>
): Record<string, unknown> => ({
  ...(value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {}),
  ...patch
});

const renderJsonTemplate = (
  value: unknown,
  context: Record<string, unknown>
): unknown => {
  if (typeof value === "string") return renderTemplate(value, context);
  if (Array.isArray(value)) return value.map((item) => renderJsonTemplate(item, context));
  if (isRecord(value)) {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [
        key,
        renderJsonTemplate(item, context)
      ])
    );
  }
  return value;
};

const customHeaders = (
  value: unknown,
  context: Record<string, unknown>
): Record<string, string> => {
  if (!Array.isArray(value)) return {};
  const headers: Record<string, string> = {};
  for (const item of value) {
    if (!isRecord(item)) continue;
    const key = String(item.key ?? item.name ?? "").trim();
    if (!key) continue;
    headers[key] = renderTemplate(String(item.value ?? ""), context);
  }
  return headers;
};

const runWebhookNode = async (
  node: Record<string, unknown>,
  context: Record<string, unknown>
): Promise<Record<string, unknown>> => {
  const data = objectOrEmpty(node.data as JsonValue);
  if (data.enabled === false) {
    return { node_id: node.id ?? null, status: "skipped", reason: "disabled" };
  }
  const endpointUrl =
    typeof data.endpoint_url === "string" ? renderTemplate(data.endpoint_url, context) : "";
  if (!endpointUrl) {
    return { node_id: node.id ?? null, status: "skipped", reason: "missing_endpoint_url" };
  }
  const method = String(data.http_method ?? "POST").toUpperCase();
  const headers = {
    "Content-Type": "application/json",
    ...customHeaders(data.custom_headers, context)
  };
  const payload = renderJsonTemplate(
    data.payload_template ?? {
      workflow_run_id: "{{workflow_run_id}}",
      gathered_context: "{{gathered_context}}"
    },
    context
  );
  const init: RequestInit = { method, headers };
  if (!["GET", "HEAD"].includes(method)) {
    init.body = JSON.stringify(payload);
  }
  const response = await fetch(endpointUrl, init);
  const text = await response.text();
  return {
    node_id: node.id ?? null,
    status: response.ok ? "completed" : "failed",
    http_status: response.status,
    response_body: text.slice(0, 4000)
  };
};

const buildQaAnnotation = (
  node: Record<string, unknown>,
  context: Record<string, unknown>
): Record<string, unknown> => {
  const transcript = String(context.transcript ?? context.transcript_text ?? "");
  const gathered = objectOrEmpty(context.gathered_context as JsonValue);
  const extracted = objectOrEmpty(gathered.extracted_variables as JsonValue);
  return {
    node_id: node.id ?? null,
    status: "completed",
    evaluated_at: new Date().toISOString(),
    transcript_character_count: transcript.length,
    extracted_variable_count: Object.keys(extracted).length,
    has_recording: Boolean(context.recording_url),
    has_transcript: Boolean(context.transcript_url)
  };
};

const handleRunIntegrationsPostWorkflowRun: TaskHandler = async (...rawArgs) => {
  const task = functionNames.runIntegrationsPostWorkflowRun;
  const args = pythonArgs(rawArgs);
  const workflowRunId = numberAt(args, 0);
  if (workflowRunId == null) return skipped(task, "missing workflow_run_id");

  try {
    const run = await getWorkflowRunById(workflowRunId);
    if (!run) return skipped(task, "workflow run was not found");
    const workflow = await getWorkflowById(run.workflow_id);
    if (!workflow) return skipped(task, "workflow was not found");

    const definition = await getWorkflowDefinitionForExecution(workflow, {
      useDraft: false
    });
    const workflowJson = objectOrEmpty(definition?.workflow_json ?? workflow.workflow_definition);
    const nodes = Array.isArray(workflowJson.nodes) ? workflowJson.nodes : [];
    const qaNodes = nodes.filter((node) => isRecord(node) && node.type === nodeTypes.qaNode);
    const webhookNodes = nodes.filter(
      (node) => isRecord(node) && node.type === nodeTypes.webhookNode
    );
    const context = {
      workflow_run_id: workflowRunId,
      workflow_id: run.workflow_id,
      workflow_name: workflow.name,
      initial_context: objectOrEmpty(run.initial_context),
      gathered_context: objectOrEmpty(run.gathered_context),
      annotations: objectOrEmpty(run.annotations),
      usage_info: objectOrEmpty(run.usage_info),
      cost_info: objectOrEmpty(run.cost_info),
      recording_url: run.recording_url,
      transcript_url: run.transcript_url,
      state: run.state,
      is_completed: run.is_completed
    };
    const webhookResults = [];
    for (const node of webhookNodes) {
      try {
        webhookResults.push(await runWebhookNode(node, context));
      } catch (error) {
        webhookResults.push({
          node_id: node.id ?? null,
          status: "failed",
          error: error instanceof Error ? error.message : String(error)
        });
      }
    }
    const qaResults = qaNodes.map((node) => buildQaAnnotation(node, context));

    const annotations = mergeJsonObject(run.annotations, {
      integrations: {
        processed_at: new Date().toISOString(),
        qa_nodes: qaNodes.length,
        webhook_nodes: webhookNodes.length,
        webhooks: webhookResults
      },
      qa: qaResults
    });
    await updateWorkflowRun(workflowRunId, { annotations });

    return {
      status: "completed",
      task,
      workflow_run_id: workflowRunId,
      qa_nodes: qaNodes.length,
      webhook_nodes: webhookNodes.length,
      webhook_results: webhookResults
    };
  } catch (error) {
    return failed(task, error);
  }
};

const handleUploadVoicemailAudioToS3: TaskHandler = async (...rawArgs) => {
  const task = functionNames.uploadVoicemailAudioToS3;
  const args = pythonArgs(rawArgs);
  const workflowRunId = numberAt(args, 0);
  const tempFilePath = typeof args[1] === "string" ? args[1] : null;
  const storageKey = typeof args[2] === "string" ? args[2] : null;
  if (workflowRunId == null || !tempFilePath || !storageKey) {
    return skipped(task, "missing workflow_run_id, temp_file_path, or storage key");
  }

  const uploaded = await uploadTempFile({
    localPath: tempFilePath,
    storageKey,
    contentType: "audio/wav"
  });
  return uploaded
    ? { status: "completed", task, workflow_run_id: workflowRunId, storage_key: storageKey }
    : skipped(task, "voicemail temp file was absent or upload failed");
};

const handleProcessWorkflowCompletion: TaskHandler = async (...rawArgs) => {
  const task = functionNames.processWorkflowCompletion;
  const args = pythonArgs(rawArgs);
  const workflowRunId = numberAt(args, 0);
  if (workflowRunId == null) return skipped(task, "missing workflow_run_id");

  const [audioPath, transcriptPath, userAudioPath, botAudioPath] = args
    .slice(1, 5)
    .map((value) => (typeof value === "string" && value ? value : null));

  try {
    const run = await getWorkflowRunById(workflowRunId);
    if (!run) return skipped(task, "workflow run was not found");

    const recordings: Record<string, Record<string, string>> = {};
    const storageBackend = getCurrentStorageBackend();

    if (audioPath) {
      const storageKey = `recordings/${workflowRunId}.wav`;
      if (
        await uploadTempFile({
          localPath: audioPath,
          storageKey,
          contentType: "audio/wav"
        })
      ) {
        recordings.mixed = {
          storage_key: storageKey,
          storage_backend: storageBackend,
          format: "wav",
          track: "mixed"
        };
        await updateWorkflowRun(workflowRunId, {
          recording_url: storageKey
        });
      }
    }

    if (userAudioPath) {
      const storageKey = `recordings/${workflowRunId}/user.wav`;
      if (
        await uploadTempFile({
          localPath: userAudioPath,
          storageKey,
          contentType: "audio/wav"
        })
      ) {
        recordings.user = {
          storage_key: storageKey,
          storage_backend: storageBackend,
          format: "wav",
          track: "user"
        };
      }
    }

    if (botAudioPath) {
      const storageKey = `recordings/${workflowRunId}/bot.wav`;
      if (
        await uploadTempFile({
          localPath: botAudioPath,
          storageKey,
          contentType: "audio/wav"
        })
      ) {
        recordings.bot = {
          storage_key: storageKey,
          storage_backend: storageBackend,
          format: "wav",
          track: "bot"
        };
      }
    }

    const patch: Parameters<typeof updateWorkflowRun>[1] = {
      state: "completed",
      is_completed: true
    };
    if (Object.keys(recordings).length > 0) {
      patch.extra = mergeJsonObject(run.extra, { recordings });
    }

    if (transcriptPath) {
      const transcriptKey = `transcripts/${workflowRunId}.txt`;
      if (
        await uploadTempFile({
          localPath: transcriptPath,
          storageKey: transcriptKey,
          contentType: "text/plain"
        })
      ) {
        patch.transcript_url = transcriptKey;
      }
    }

    await updateWorkflowRun(workflowRunId, patch);
    const integrationResult = await handleRunIntegrationsPostWorkflowRun(workflowRunId);

    return {
      status: "completed",
      task,
      workflow_run_id: workflowRunId,
      recordings: Object.keys(recordings),
      integrations: integrationResult.status
    };
  } catch (error) {
    return failed(task, error);
  }
};

const handleSyncCampaignSource: TaskHandler = async (...rawArgs) => {
  const task = functionNames.syncCampaignSource;
  const args = pythonArgs(rawArgs);
  const campaignId = numberAt(args, 0);
  if (campaignId == null) return skipped(task, "missing campaign_id");

  try {
    const campaign = await db
      .selectFrom("campaigns")
      .selectAll()
      .where("id", "=", campaignId)
      .executeTakeFirst();
    if (!campaign) return skipped(task, "campaign was not found");

    const queuedCount = await db
      .selectFrom("queued_runs")
      .select(sql<number>`count(id)`.as("count"))
      .where("campaign_id", "=", campaignId)
      .executeTakeFirst();
    const totalRows = Number(queuedCount?.count ?? campaign.total_rows ?? 0);

    await db
      .updateTable("campaigns")
      .set({
        total_rows: totalRows,
        source_sync_status: "completed",
        source_last_synced_at: new Date(),
        state: totalRows > 0 ? "running" : "completed",
        completed_at: totalRows > 0 ? campaign.completed_at : new Date(),
        updated_at: new Date()
      })
      .where("id", "=", campaignId)
      .executeTakeFirst();

    return { status: "completed", task, campaign_id: campaignId, rows_synced: totalRows };
  } catch (error) {
    return failed(task, error);
  }
};

const handleProcessCampaignBatch: TaskHandler = async (...rawArgs) => {
  const task = functionNames.processCampaignBatch;
  const args = pythonArgs(rawArgs);
  const campaignId = numberAt(args, 0);
  const batchSize = numberAt(args, 1) ?? 10;
  if (campaignId == null) return skipped(task, "missing campaign_id");

  try {
    const queuedRuns = await db
      .selectFrom("queued_runs")
      .select(["id"])
      .where("campaign_id", "=", campaignId)
      .where("state", "=", "queued")
      .orderBy("created_at", "asc")
      .limit(batchSize)
      .execute();
    const ids = queuedRuns.map((run) => Number(run.id));

    if (ids.length > 0) {
      await db
        .updateTable("queued_runs")
        .set({ state: "processed", processed_at: new Date() })
        .where("id", "in", ids)
        .executeTakeFirst();
    }

    const remaining = await db
      .selectFrom("queued_runs")
      .select(sql<number>`count(id)`.as("count"))
      .where("campaign_id", "=", campaignId)
      .where("state", "=", "queued")
      .executeTakeFirst();

    await db
      .updateTable("campaigns")
      .set({
        processed_rows: sql<number>`COALESCE(processed_rows, 0) + ${ids.length}`,
        state: Number(remaining?.count ?? 0) === 0 ? "completed" : "running",
        completed_at: Number(remaining?.count ?? 0) === 0 ? new Date() : null,
        last_activity_at: new Date(),
        updated_at: new Date()
      })
      .where("id", "=", campaignId)
      .executeTakeFirst();

    return { status: "completed", task, campaign_id: campaignId, processed_count: ids.length };
  } catch (error) {
    return failed(task, error);
  }
};

const handleProcessKnowledgeBaseDocument: TaskHandler = async (...rawArgs) => {
  const task = functionNames.processKnowledgeBaseDocument;
  const args = pythonArgs(rawArgs);
  const documentId = numberAt(args, 0);
  const s3Key = typeof args[1] === "string" ? args[1] : null;
  const organizationId = numberAt(args, 2);
  const retrievalMode =
    typeof args[5] === "string" && args[5] ? args[5] : "chunked";
  if (documentId == null || !s3Key || organizationId == null) {
    return skipped(task, "missing document_id, storage key, or organization_id");
  }

  try {
    await db
      .updateTable("knowledge_base_documents")
      .set({ processing_status: "processing", updated_at: new Date() })
      .where("id", "=", documentId)
      .where("organization_id", "=", organizationId)
      .executeTakeFirst();

    const localTextPath = path.isAbsolute(s3Key) ? s3Key : null;
    if (localTextPath && (await fileExists(localTextPath))) {
      const text = await fs.readFile(localTextPath, "utf8");
      await db
        .updateTable("knowledge_base_documents")
        .set({
          full_text: text,
          total_chunks: retrievalMode === "full_document" ? 0 : 1,
          processing_status: "completed",
          processing_error: null,
          updated_at: new Date()
        })
        .where("id", "=", documentId)
        .where("organization_id", "=", organizationId)
        .executeTakeFirst();
      if (retrievalMode !== "full_document") {
        await db
          .insertInto("knowledge_base_chunks")
          .values({
            document_id: documentId,
            organization_id: organizationId,
            chunk_text: text,
            contextualized_text: null,
            chunk_index: 0,
            token_count: null,
            embedding: sql`NULL`,
            embedding_model: "unembedded",
            embedding_dimension: 1536,
            chunk_metadata: {}
          })
          .executeTakeFirst();
      }
      return { status: "completed", task, document_id: documentId, chunks: retrievalMode === "full_document" ? 0 : 1 };
    }

    await db
      .updateTable("knowledge_base_documents")
      .set({
        processing_status: "failed",
        processing_error:
          "Document processing requires a readable local file or a configured MPS document pipeline.",
        updated_at: new Date()
      })
      .where("id", "=", documentId)
      .where("organization_id", "=", organizationId)
      .executeTakeFirst();
    return skipped(task, "document source is not locally readable");
  } catch (error) {
    return failed(task, error);
  }
};

export const taskHandlers: Record<FunctionName, TaskHandler> = {
  [functionNames.runIntegrationsPostWorkflowRun]: handleRunIntegrationsPostWorkflowRun,
  [functionNames.uploadVoicemailAudioToS3]: handleUploadVoicemailAudioToS3,
  [functionNames.processWorkflowCompletion]: handleProcessWorkflowCompletion,
  [functionNames.syncCampaignSource]: handleSyncCampaignSource,
  [functionNames.processCampaignBatch]: handleProcessCampaignBatch,
  [functionNames.processKnowledgeBaseDocument]: handleProcessKnowledgeBaseDocument
};
