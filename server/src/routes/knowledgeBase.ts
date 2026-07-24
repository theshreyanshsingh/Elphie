import crypto from "node:crypto";
import type { RequestHandler, Router } from "express";
import { z } from "zod";
import {
  createKnowledgeBaseDocument,
  deleteKnowledgeBaseDocument,
  getKnowledgeBaseDocumentByUuid,
  listKnowledgeBaseDocuments,
  searchKnowledgeBaseChunks,
  type KnowledgeBaseDocumentRecord
} from "../db/repositories/knowledgeBase.js";
import { HttpError } from "../errors/httpError.js";
import { requireSelectedOrganization, requireUser } from "../middleware/auth.js";
import {
  getCurrentStorageBackend,
  getStorageForBackend
} from "../services/storage/storage.js";
import { enqueueJob } from "../tasks/queue.js";
import { functionNames } from "../tasks/functionNames.js";

const uploadSchema = z.object({
  filename: z.string().min(1),
  mime_type: z.string().min(1),
  custom_metadata: z.record(z.unknown()).nullable().optional()
});

const processSchema = z.object({
  document_uuid: z.string().min(1),
  s3_key: z.string().min(1),
  retrieval_mode: z.string().default("chunked")
});

const listQuerySchema = z.object({
  status: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(100),
  offset: z.coerce.number().int().min(0).default(0)
});

const searchSchema = z.object({
  query: z.string().min(1),
  limit: z.number().int().min(1).max(50).default(5),
  document_uuids: z.array(z.string()).nullable().optional(),
  min_similarity: z.number().min(0).max(1).nullable().optional()
});

const selectedOrganizationId = (req: Parameters<RequestHandler>[0]): number => {
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

export const documentResponse = (document: KnowledgeBaseDocumentRecord) => ({
  id: document.id,
  document_uuid: document.document_uuid,
  filename: document.filename,
  file_size_bytes: document.file_size_bytes ?? 0,
  file_hash: document.file_hash ?? "",
  mime_type: document.mime_type ?? "application/octet-stream",
  processing_status: document.processing_status,
  processing_error: document.processing_error,
  total_chunks: document.total_chunks,
  retrieval_mode: document.retrieval_mode,
  custom_metadata: objectOrEmpty(document.custom_metadata),
  docling_metadata: objectOrEmpty(document.docling_metadata),
  source_url: document.source_url,
  created_at: document.created_at,
  updated_at: document.updated_at,
  organization_id: document.organization_id,
  created_by: document.created_by,
  is_active: document.is_active
});

const uploadUrl: RequestHandler = async (req, res, next) => {
  try {
    const organizationId = selectedOrganizationId(req);
    const body = uploadSchema.parse(req.body);
    const documentUuid = crypto.randomUUID();
    const s3Key = `knowledge_base/${organizationId}/${documentUuid}/${body.filename}`;
    const storage = getStorageForBackend(getCurrentStorageBackend());
    const url = await storage.getPresignedPutUrl(s3Key, {
      expiration: 1800,
      contentType: body.mime_type,
      maxSize: 100_000_000
    });
    if (!url) {
      throw new HttpError(500, "Failed to generate presigned upload URL");
    }
    res.json({
      upload_url: url,
      document_uuid: documentUuid,
      s3_key: s3Key
    });
  } catch (err) {
    next(err);
  }
};

const processDocument: RequestHandler = async (req, res, next) => {
  try {
    if (!req.user) throw new HttpError(401, "Unauthorized");
    const organizationId = selectedOrganizationId(req);
    const body = processSchema.parse(req.body);
    const filename = body.s3_key.split("/").at(-1) || body.document_uuid;
    const document = await createKnowledgeBaseDocument(organizationId, req.user.id, {
      documentUuid: body.document_uuid,
      filename,
      s3Key: body.s3_key,
      retrievalMode: body.retrieval_mode
    });
    await enqueueJob(
      functionNames.processKnowledgeBaseDocument,
      document.id,
      body.s3_key,
      organizationId,
      String(req.user.providerId),
      128,
      body.retrieval_mode
    );
    res.json(documentResponse(document));
  } catch (err) {
    next(err);
  }
};

const listDocuments: RequestHandler = async (req, res, next) => {
  try {
    const organizationId = selectedOrganizationId(req);
    const query = listQuerySchema.parse(req.query);
    const documents = await listKnowledgeBaseDocuments(organizationId, {
      status: query.status,
      limit: query.limit,
      offset: query.offset
    });
    res.json({
      documents: documents.map(documentResponse),
      total: documents.length,
      limit: query.limit,
      offset: query.offset
    });
  } catch (err) {
    next(err);
  }
};

const getDocument: RequestHandler = async (req, res, next) => {
  try {
    const document = await getKnowledgeBaseDocumentByUuid(
      selectedOrganizationId(req),
      String(req.params.document_uuid)
    );
    if (!document) {
      throw new HttpError(404, "Document not found");
    }
    res.json(documentResponse(document));
  } catch (err) {
    next(err);
  }
};

const deleteDocument: RequestHandler = async (req, res, next) => {
  try {
    const success = await deleteKnowledgeBaseDocument(
      selectedOrganizationId(req),
      String(req.params.document_uuid)
    );
    if (!success) {
      throw new HttpError(404, "Document not found");
    }
    res.json({ success: true, message: "Document deleted successfully" });
  } catch (err) {
    next(err);
  }
};

const searchChunks: RequestHandler = async (req, res, next) => {
  try {
    const organizationId = selectedOrganizationId(req);
    const body = searchSchema.parse(req.body);
    const chunks = await searchKnowledgeBaseChunks(organizationId, {
      query: body.query,
      limit: body.limit,
      documentUuids: body.document_uuids,
      minSimilarity: body.min_similarity
    });
    res.json({
      chunks: chunks.map((chunk) => ({
        id: chunk.id,
        document_id: chunk.document_id,
        chunk_text: chunk.chunk_text,
        contextualized_text: chunk.contextualized_text,
        chunk_index: chunk.chunk_index,
        chunk_metadata: objectOrEmpty(chunk.chunk_metadata),
        filename: chunk.filename,
        document_uuid: chunk.document_uuid,
        similarity: chunk.similarity
      })),
      query: body.query,
      total_results: chunks.length
    });
  } catch (err) {
    next(err);
  }
};

export const registerKnowledgeBaseRoutes = (router: Router): void => {
  router.post(
    "/knowledge-base/upload-url",
    requireUser,
    requireSelectedOrganization,
    uploadUrl
  );
  router.post(
    "/knowledge-base/process-document",
    requireUser,
    requireSelectedOrganization,
    processDocument
  );
  router.get(
    "/knowledge-base/documents",
    requireUser,
    requireSelectedOrganization,
    listDocuments
  );
  router.get(
    "/knowledge-base/documents/:document_uuid",
    requireUser,
    requireSelectedOrganization,
    getDocument
  );
  router.delete(
    "/knowledge-base/documents/:document_uuid",
    requireUser,
    requireSelectedOrganization,
    deleteDocument
  );
  router.post(
    "/knowledge-base/search",
    requireUser,
    requireSelectedOrganization,
    searchChunks
  );
};
