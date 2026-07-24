import type { RequestHandler, Router } from "express";
import { z } from "zod";
import {
  checkRecordingIdExists,
  createRecording,
  deleteRecording,
  generateShortRecordingId,
  getRecordingById,
  listRecordings,
  replaceRecordingIdInWorkflows,
  type WorkflowRecordingRecord,
  updateRecordingId
} from "../db/repositories/workflowRecordings.js";
import { env } from "../config/env.js";
import { HttpError } from "../errors/httpError.js";
import { requireSelectedOrganization, requireUser } from "../middleware/auth.js";
import {
  getCurrentStorageBackend,
  getStorageForBackend
} from "../services/storage/storage.js";
import { transcribeAudioWithMps } from "../services/mps/client.js";

const uploadRequestSchema = z.object({
  files: z.array(
    z.object({
      filename: z.string().min(1),
      mime_type: z.string().default("audio/wav"),
      file_size: z.number().int().positive().max(5_242_880)
    })
  ).min(1).max(20)
});

const createRequestSchema = z.object({
  recordings: z.array(
    z.object({
      recording_id: z.string().min(1),
      workflow_id: z.number().int().nullable().optional(),
      tts_provider: z.string().nullable().optional(),
      tts_model: z.string().nullable().optional(),
      tts_voice_id: z.string().nullable().optional(),
      transcript: z.string(),
      storage_key: z.string().min(1),
      metadata: z.record(z.unknown()).nullable().optional()
    })
  ).min(1).max(20)
});

const listQuerySchema = z.object({
  workflow_id: z.coerce.number().int().optional(),
  tts_provider: z.string().optional(),
  tts_model: z.string().optional(),
  tts_voice_id: z.string().optional()
});

const updateSchema = z.object({
  recording_id: z.string().min(1).max(64).regex(/^[a-zA-Z0-9_-]+$/)
});

const selectedOrganizationId = (req: Parameters<RequestHandler>[0]): number => {
  const organizationId = req.user?.selectedOrganizationId;
  if (!organizationId) {
    throw new HttpError(400, "No organization selected");
  }
  return organizationId;
};

export const recordingResponse = (recording: WorkflowRecordingRecord) => ({
  id: recording.id,
  recording_id: recording.recording_id,
  workflow_id: recording.workflow_id,
  organization_id: recording.organization_id,
  tts_provider: recording.tts_provider,
  tts_model: recording.tts_model,
  tts_voice_id: recording.tts_voice_id,
  transcript: recording.transcript,
  storage_key: recording.storage_key,
  storage_backend: recording.storage_backend,
  metadata:
    recording.recording_metadata &&
    typeof recording.recording_metadata === "object" &&
    !Array.isArray(recording.recording_metadata)
      ? recording.recording_metadata
      : {},
  created_by: recording.created_by,
  created_at: recording.created_at,
  is_active: recording.is_active
});

const generateUniqueRecordingId = async (
  organizationId: number
): Promise<string> => {
  for (let attempt = 0; attempt < 10; attempt += 1) {
    const recordingId = generateShortRecordingId(8);
    if (!(await checkRecordingIdExists(organizationId, recordingId))) {
      return recordingId;
    }
  }
  throw new HttpError(500, "Failed to generate unique recording ID");
};

const getUploadUrls: RequestHandler = async (req, res, next) => {
  try {
    const organizationId = selectedOrganizationId(req);
    const body = uploadRequestSchema.parse(req.body);
    const storage = getStorageForBackend(getCurrentStorageBackend());
    const items = [];

    for (const file of body.files) {
      const recordingId = await generateUniqueRecordingId(organizationId);
      const storageKey = `recordings/${organizationId}/${recordingId}/${file.filename}`;
      const uploadUrl = await storage.getPresignedPutUrl(storageKey, {
        expiration: 1800,
        contentType: file.mime_type,
        maxSize: file.file_size
      });
      if (!uploadUrl) {
        throw new HttpError(
          500,
          `Failed to generate presigned upload URL for ${file.filename}`
        );
      }
      items.push({
        upload_url: uploadUrl,
        recording_id: recordingId,
        storage_key: storageKey
      });
    }

    res.json({ items });
  } catch (err) {
    next(err);
  }
};

const createMany: RequestHandler = async (req, res, next) => {
  try {
    if (!req.user) throw new HttpError(401, "Unauthorized");
    const organizationId = selectedOrganizationId(req);
    const body = createRequestSchema.parse(req.body);
    const storageBackend = getCurrentStorageBackend();
    const recordings = [];

    for (const item of body.recordings) {
      const recording = await createRecording(organizationId, req.user.id, {
        recordingId: item.recording_id,
        workflowId: item.workflow_id,
        transcript: item.transcript,
        storageKey: item.storage_key,
        storageBackend,
        ttsProvider: item.tts_provider,
        ttsModel: item.tts_model,
        ttsVoiceId: item.tts_voice_id,
        metadata: item.metadata
      });
      recordings.push(recordingResponse(recording));
    }

    res.json({ recordings });
  } catch (err) {
    next(err);
  }
};

const list: RequestHandler = async (req, res, next) => {
  try {
    const organizationId = selectedOrganizationId(req);
    const query = listQuerySchema.parse(req.query);
    const recordings = await listRecordings(organizationId, {
      workflowId: query.workflow_id,
      ttsProvider: query.tts_provider,
      ttsModel: query.tts_model,
      ttsVoiceId: query.tts_voice_id
    });
    res.json({
      recordings: recordings.map(recordingResponse),
      total: recordings.length
    });
  } catch (err) {
    next(err);
  }
};

const remove: RequestHandler = async (req, res, next) => {
  try {
    const success = await deleteRecording(
      selectedOrganizationId(req),
      String(req.params.recording_id)
    );
    if (!success) {
      throw new HttpError(404, "Recording not found");
    }
    res.json({ success: true, message: "Recording deleted successfully" });
  } catch (err) {
    next(err);
  }
};

const update: RequestHandler = async (req, res, next) => {
  try {
    const organizationId = selectedOrganizationId(req);
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) {
      throw new HttpError(422, "Invalid recording id");
    }
    const body = updateSchema.parse(req.body);
    const newId = body.recording_id.trim();
    const existing = await getRecordingById(organizationId, id);
    if (!existing) {
      throw new HttpError(404, "Recording not found");
    }
    if (newId === existing.recording_id) {
      res.json(recordingResponse(existing));
      return;
    }
    if (await checkRecordingIdExists(organizationId, newId)) {
      throw new HttpError(409, `Recording ID '${newId}' is already in use`);
    }
    const recording = await updateRecordingId(organizationId, id, newId);
    if (!recording) {
      throw new HttpError(404, "Recording not found");
    }
    await replaceRecordingIdInWorkflows(
      organizationId,
      existing.recording_id,
      newId
    );
    res.json(recordingResponse(recording));
  } catch (err) {
    next(err);
  }
};

const transcribe: RequestHandler = async (req, res, next) => {
  try {
    if (!req.user) throw new HttpError(401, "Unauthorized");
    const files = (req.files ?? []) as Express.Multer.File[];
    const file = files.find((item) => item.fieldname === "file") ?? files[0];
    if (!file) {
      throw new HttpError(422, "Audio file is required");
    }
    const language = typeof req.body.language === "string" ? req.body.language : "en";
    const result = await transcribeAudioWithMps({
      audioData: file.buffer,
      filename: file.originalname || "audio.wav",
      contentType: file.mimetype || "audio/wav",
      language,
      organizationId:
        env.deploymentMode === "oss" ? null : req.user.selectedOrganizationId,
      createdBy: env.deploymentMode === "oss" ? req.user.providerId : null
    });
    res.json(result);
  } catch (err) {
    next(err);
  }
};

export const registerWorkflowRecordingRoutes = (router: Router): void => {
  router.post(
    "/workflow-recordings/upload-url",
    requireUser,
    requireSelectedOrganization,
    getUploadUrls
  );
  router.get(
    "/workflow-recordings/",
    requireUser,
    requireSelectedOrganization,
    list
  );
  router.post(
    "/workflow-recordings/",
    requireUser,
    requireSelectedOrganization,
    createMany
  );
  router.patch(
    "/workflow-recordings/:id",
    requireUser,
    requireSelectedOrganization,
    update
  );
  router.delete(
    "/workflow-recordings/:recording_id",
    requireUser,
    requireSelectedOrganization,
    remove
  );
  router.post(
    "/workflow-recordings/transcribe",
    requireUser,
    transcribe
  );
};
