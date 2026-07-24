import crypto from "node:crypto";
import type { RequestHandler, Router } from "express";
import { z } from "zod";
import { getWorkflowRunStorageInfo } from "../db/repositories/workflowRuns.js";
import { HttpError } from "../errors/httpError.js";
import { requireUser } from "../middleware/auth.js";
import {
  getCurrentStorageBackend,
  getStorageForBackend
} from "../services/storage/storage.js";

const ORG_SCOPED_STORAGE_PREFIXES = new Set(["campaigns", "knowledge_base"]);

const signedUrlQuerySchema = z.object({
  key: z.string().min(1),
  expires_in: z.coerce.number().int().positive().default(3600),
  inline: z
    .union([z.boolean(), z.string()])
    .optional()
    .transform((value) => value === true || value === "true"),
  storage_backend: z.enum(["s3", "minio"]).optional()
});

const fileMetadataQuerySchema = z.object({
  key: z.string().min(1)
});

const presignedUploadSchema = z.object({
  file_name: z.string().regex(/.*\.csv$/),
  file_size: z.number().int().positive().max(10_485_760),
  content_type: z.string().default("text/csv")
});

export const extractOrgIdFromKey = (key: string): number | null => {
  const parts = key.split("/");
  if (
    parts.length >= 3 &&
    ORG_SCOPED_STORAGE_PREFIXES.has(parts[0]) &&
    /^\d+$/.test(parts[1])
  ) {
    return Number(parts[1]);
  }
  return null;
};

export const extractLegacyWorkflowRunId = (key: string): number | null => {
  if (key.startsWith("transcripts/") && key.endsWith(".txt")) {
    const runId = key.slice("transcripts/".length, -".txt".length);
    return /^\d+$/.test(runId) ? Number(runId) : null;
  }

  const recordingMatch = key.match(/^recordings\/(\d+)(?:\.wav|\/(?:user|bot)\.wav)$/);
  return recordingMatch ? Number(recordingMatch[1]) : null;
};

export const validateAndExtractWorkflowRunId = (
  key: string,
  options: { allowSpecialPaths?: boolean } = {}
): number | null => {
  if (key.startsWith("transcripts/") && key.endsWith(".txt")) {
    const runId = key.slice("transcripts/".length, -".txt".length);
    if (!/^\d+$/.test(runId)) {
      throw new HttpError(400, "Invalid workflow_run_id in key");
    }
    return Number(runId);
  }

  if (key.startsWith("recordings/")) {
    const runId = extractLegacyWorkflowRunId(key);
    if (runId == null) {
      throw new HttpError(400, "Invalid workflow_run_id in key");
    }
    return runId;
  }

  if (options.allowSpecialPaths && key.startsWith("voicemail_detections/")) {
    return null;
  }

  throw new HttpError(400, "Invalid key format");
};

export const sanitizeCsvFileName = (fileName: string): string =>
  fileName.replace(/[^a-zA-Z0-9._-]/g, "_");

const selectedOrganizationId = (req: Parameters<RequestHandler>[0]): number => {
  const organizationId = req.user?.selectedOrganizationId;
  if (!organizationId) {
    throw new HttpError(400, "No organization selected");
  }
  return organizationId;
};

const authorizeWorkflowRun = async (
  req: Parameters<RequestHandler>[0],
  workflowRunId: number | null,
  options: { requireWorkflowRun?: boolean } = {}
) => {
  if (workflowRunId == null) {
    return null;
  }
  const workflowRun = await getWorkflowRunStorageInfo({
    workflowRunId,
    organizationId: req.user?.selectedOrganizationId,
    isSuperuser: req.user?.isSuperuser
  });
  if (!workflowRun && (options.requireWorkflowRun ?? true)) {
    throw new HttpError(403, "Access denied for this workflow run");
  }
  return workflowRun;
};

const signedUrl: RequestHandler = async (req, res, next) => {
  try {
    const query = signedUrlQuerySchema.parse(req.query);
    let workflowRun: Awaited<ReturnType<typeof authorizeWorkflowRun>> = null;

    const organizationId = extractOrgIdFromKey(query.key);
    if (organizationId != null) {
      if (!req.user?.isSuperuser && organizationId !== req.user?.selectedOrganizationId) {
        throw new HttpError(403, "Access denied");
      }
    } else {
      const workflowRunId = extractLegacyWorkflowRunId(query.key);
      if (workflowRunId == null) {
        throw new HttpError(400, "Invalid key format");
      }
      workflowRun = await authorizeWorkflowRun(req, workflowRunId);
    }

    const storage = getStorageForBackend(
      query.storage_backend ?? workflowRun?.storage_backend ?? getCurrentStorageBackend()
    );
    const url = await storage.getSignedUrl(query.key, {
      expiration: query.expires_in,
      forceInline: query.inline
    });
    if (!url) {
      throw new HttpError(500, "Failed to generate signed URL");
    }

    res.json({ url, expires_in: query.expires_in });
  } catch (err) {
    next(err);
  }
};

const fileMetadata: RequestHandler = async (req, res, next) => {
  try {
    const query = fileMetadataQuerySchema.parse(req.query);
    const workflowRunId = validateAndExtractWorkflowRunId(query.key, {
      allowSpecialPaths: true
    });
    const workflowRun = await authorizeWorkflowRun(req, workflowRunId, {
      requireWorkflowRun: false
    });

    const storage = getStorageForBackend(
      workflowRun?.storage_backend ?? getCurrentStorageBackend()
    );
    const metadata = await storage.getFileMetadata(query.key);
    res.json({ key: query.key, metadata });
  } catch (err) {
    next(err);
  }
};

const presignedUploadUrl: RequestHandler = async (req, res, next) => {
  try {
    const body = presignedUploadSchema.parse(req.body);
    const organizationId = selectedOrganizationId(req);
    const sanitizedName = sanitizeCsvFileName(body.file_name);
    const fileKey = `campaigns/${organizationId}/${crypto.randomUUID()}_${sanitizedName}`;
    const storage = getStorageForBackend(getCurrentStorageBackend());
    const uploadUrl = await storage.getPresignedPutUrl(fileKey, {
      expiration: 900,
      contentType: body.content_type,
      maxSize: body.file_size
    });
    if (!uploadUrl) {
      throw new HttpError(500, "Failed to generate presigned upload URL");
    }

    res.json({
      upload_url: uploadUrl,
      file_key: fileKey,
      expires_in: 900
    });
  } catch (err) {
    next(err);
  }
};

export const registerS3Routes = (router: Router): void => {
  router.get("/s3/signed-url", requireUser, signedUrl);
  router.get("/s3/file-metadata", requireUser, fileMetadata);
  router.post("/s3/presigned-upload-url", requireUser, presignedUploadUrl);
};
