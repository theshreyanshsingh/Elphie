import { randomInt } from "node:crypto";
import { sql } from "kysely";
import type { JsonValue } from "../types.js";
import { db } from "../database.js";

export type WorkflowRecordingRecord = {
  id: number;
  recording_id: string;
  workflow_id: number | null;
  organization_id: number;
  tts_provider: string | null;
  tts_model: string | null;
  tts_voice_id: string | null;
  transcript: string;
  storage_key: string;
  storage_backend: string;
  recording_metadata: JsonValue;
  created_by: number;
  created_at: Date | string;
  is_active: boolean;
};

const alphabet = "abcdefghijklmnopqrstuvwxyz0123456789";

export const generateShortRecordingId = (length = 8): string => {
  let id = "";
  for (let index = 0; index < length; index += 1) {
    id += alphabet[randomInt(alphabet.length)];
  }
  return id;
};

const asRecording = (row: unknown): WorkflowRecordingRecord =>
  row as WorkflowRecordingRecord;

export const checkRecordingIdExists = async (
  organizationId: number,
  recordingId: string
): Promise<boolean> => {
  const row = await db
    .selectFrom("workflow_recordings")
    .select("id")
    .where("organization_id", "=", organizationId)
    .where("recording_id", "=", recordingId)
    .where("is_active", "=", true)
    .executeTakeFirst();
  return Boolean(row);
};

export const createRecording = async (
  organizationId: number,
  userId: number,
  input: {
    recordingId: string;
    transcript: string;
    storageKey: string;
    storageBackend: string;
    workflowId?: number | null;
    ttsProvider?: string | null;
    ttsModel?: string | null;
    ttsVoiceId?: string | null;
    metadata?: Record<string, unknown> | null;
  }
): Promise<WorkflowRecordingRecord> => {
  const row = await db
    .insertInto("workflow_recordings")
    .values({
      recording_id: input.recordingId,
      workflow_id: input.workflowId ?? null,
      organization_id: organizationId,
      tts_provider: input.ttsProvider ?? null,
      tts_model: input.ttsModel ?? null,
      tts_voice_id: input.ttsVoiceId ?? null,
      transcript: input.transcript,
      storage_key: input.storageKey,
      storage_backend: input.storageBackend,
      recording_metadata: input.metadata ?? {},
      created_by: userId,
      is_active: true
    })
    .returningAll()
    .executeTakeFirstOrThrow();
  return asRecording(row);
};

export const listRecordings = async (
  organizationId: number,
  filters: {
    workflowId?: number | null;
    ttsProvider?: string | null;
    ttsModel?: string | null;
    ttsVoiceId?: string | null;
  } = {}
): Promise<WorkflowRecordingRecord[]> => {
  let query = db
    .selectFrom("workflow_recordings")
    .selectAll()
    .where("organization_id", "=", organizationId)
    .where("is_active", "=", true);

  if (filters.workflowId != null) {
    query = query.where("workflow_id", "=", filters.workflowId);
  }
  if (filters.ttsProvider) {
    query = query.where("tts_provider", "=", filters.ttsProvider);
  }
  if (filters.ttsModel) {
    query = query.where("tts_model", "=", filters.ttsModel);
  }
  if (filters.ttsVoiceId) {
    query = query.where("tts_voice_id", "=", filters.ttsVoiceId);
  }

  const rows = await query.orderBy("created_at", "desc").execute();
  return rows.map(asRecording);
};

export const getRecordingById = async (
  organizationId: number,
  id: number
): Promise<WorkflowRecordingRecord | null> => {
  const row = await db
    .selectFrom("workflow_recordings")
    .selectAll()
    .where("organization_id", "=", organizationId)
    .where("id", "=", id)
    .where("is_active", "=", true)
    .executeTakeFirst();
  return row ? asRecording(row) : null;
};

export const updateRecordingId = async (
  organizationId: number,
  id: number,
  recordingId: string
): Promise<WorkflowRecordingRecord | null> => {
  const row = await db
    .updateTable("workflow_recordings")
    .set({ recording_id: recordingId })
    .where("organization_id", "=", organizationId)
    .where("id", "=", id)
    .where("is_active", "=", true)
    .returningAll()
    .executeTakeFirst();
  return row ? asRecording(row) : null;
};

export const deleteRecording = async (
  organizationId: number,
  recordingId: string
): Promise<boolean> => {
  const result = await db
    .updateTable("workflow_recordings")
    .set({ is_active: false })
    .where("organization_id", "=", organizationId)
    .where("recording_id", "=", recordingId)
    .executeTakeFirst();
  return Number(result.numUpdatedRows) > 0;
};

export const replaceRecordingIdInWorkflows = async (
  organizationId: number,
  oldRecordingId: string,
  newRecordingId: string
): Promise<number> => {
  const oldPattern = `RECORDING_ID: ${oldRecordingId}`;
  const newPattern = `RECORDING_ID: ${newRecordingId}`;

  const draftResult = await sql<{ count: number }>`
    WITH updated AS (
      UPDATE workflows
      SET workflow_definition =
        REPLACE(workflow_definition::text, ${oldPattern}, ${newPattern})::json
      WHERE organization_id = ${organizationId}
        AND workflow_definition::text LIKE '%' || ${oldPattern} || '%'
      RETURNING 1
    )
    SELECT count(*)::int as count FROM updated
  `.execute(db);

  const versionResult = await sql<{ count: number }>`
    WITH updated AS (
      UPDATE workflow_definitions wd
      SET workflow_json =
        REPLACE(wd.workflow_json::text, ${oldPattern}, ${newPattern})::json
      FROM workflows w
      WHERE wd.workflow_id = w.id
        AND w.organization_id = ${organizationId}
        AND wd.status != 'legacy'
        AND wd.workflow_json::text LIKE '%' || ${oldPattern} || '%'
      RETURNING 1
    )
    SELECT count(*)::int as count FROM updated
  `.execute(db);

  return (
    Number(draftResult.rows[0]?.count ?? 0) +
    Number(versionResult.rows[0]?.count ?? 0)
  );
};
