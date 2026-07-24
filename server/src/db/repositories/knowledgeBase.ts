import { sql } from "kysely";
import type { JsonValue } from "../types.js";
import { db } from "../database.js";

export type KnowledgeBaseDocumentRecord = {
  id: number;
  document_uuid: string;
  organization_id: number;
  filename: string;
  file_size_bytes: number | null;
  file_hash: string | null;
  mime_type: string | null;
  processing_status: string;
  processing_error: string | null;
  total_chunks: number;
  retrieval_mode: string;
  custom_metadata: JsonValue;
  docling_metadata: JsonValue;
  source_url: string | null;
  created_at: Date | string;
  updated_at: Date | string;
  created_by: number;
  is_active: boolean;
};

export type KnowledgeBaseChunkSearchResult = {
  id: number;
  document_id: number;
  chunk_text: string;
  contextualized_text: string | null;
  chunk_index: number;
  chunk_metadata: JsonValue;
  filename: string;
  document_uuid: string;
  similarity: number;
};

const asDocument = (row: unknown): KnowledgeBaseDocumentRecord =>
  row as KnowledgeBaseDocumentRecord;

export const createKnowledgeBaseDocument = async (
  organizationId: number,
  userId: number,
  input: {
    documentUuid: string;
    filename: string;
    s3Key: string;
    retrievalMode: string;
  }
): Promise<KnowledgeBaseDocumentRecord> => {
  const row = await db
    .insertInto("knowledge_base_documents")
    .values({
      document_uuid: input.documentUuid,
      organization_id: organizationId,
      created_by: userId,
      filename: input.filename,
      file_size_bytes: 0,
      file_hash: "",
      mime_type: "application/octet-stream",
      retrieval_mode: input.retrievalMode,
      custom_metadata: { s3_key: input.s3Key },
      docling_metadata: {},
      processing_status: "pending",
      processing_error: null,
      total_chunks: 0,
      is_active: true
    })
    .returningAll()
    .executeTakeFirstOrThrow();
  return asDocument(row);
};

export const listKnowledgeBaseDocuments = async (
  organizationId: number,
  input: { status?: string | null; limit: number; offset: number }
): Promise<KnowledgeBaseDocumentRecord[]> => {
  let query = db
    .selectFrom("knowledge_base_documents")
    .selectAll()
    .where("organization_id", "=", organizationId)
    .where("is_active", "=", true);

  if (input.status) {
    query = query.where("processing_status", "=", input.status);
  }

  const rows = await query
    .orderBy("created_at", "desc")
    .limit(input.limit)
    .offset(input.offset)
    .execute();
  return rows.map(asDocument);
};

export const getKnowledgeBaseDocumentByUuid = async (
  organizationId: number,
  documentUuid: string
): Promise<KnowledgeBaseDocumentRecord | null> => {
  const row = await db
    .selectFrom("knowledge_base_documents")
    .selectAll()
    .where("organization_id", "=", organizationId)
    .where("document_uuid", "=", documentUuid)
    .where("is_active", "=", true)
    .executeTakeFirst();
  return row ? asDocument(row) : null;
};

export const deleteKnowledgeBaseDocument = async (
  organizationId: number,
  documentUuid: string
): Promise<boolean> => {
  const result = await db
    .updateTable("knowledge_base_documents")
    .set({ is_active: false, archived_at: new Date() })
    .where("organization_id", "=", organizationId)
    .where("document_uuid", "=", documentUuid)
    .executeTakeFirst();
  return Number(result.numUpdatedRows) > 0;
};

export const searchKnowledgeBaseChunks = async (
  organizationId: number,
  input: {
    query: string;
    limit: number;
    documentUuids?: string[] | null;
    minSimilarity?: number | null;
  }
): Promise<KnowledgeBaseChunkSearchResult[]> => {
  let query = db
    .selectFrom("knowledge_base_chunks as c")
    .innerJoin("knowledge_base_documents as d", "c.document_id", "d.id")
    .select([
      "c.id as id",
      "c.document_id as document_id",
      "c.chunk_text as chunk_text",
      "c.contextualized_text as contextualized_text",
      "c.chunk_index as chunk_index",
      "c.chunk_metadata as chunk_metadata",
      "d.filename as filename",
      "d.document_uuid as document_uuid",
      sql<number>`CASE WHEN c.chunk_text ILIKE ${`%${input.query}%`} THEN 1 ELSE 0 END`.as(
        "similarity"
      )
    ])
    .where("c.organization_id", "=", organizationId)
    .where("d.organization_id", "=", organizationId)
    .where("d.is_active", "=", true);

  if (input.documentUuids?.length) {
    query = query.where("d.document_uuid", "in", input.documentUuids);
  }

  query = query.where("c.chunk_text", "ilike", `%${input.query}%`);

  const rows = await query
    .orderBy("similarity", "desc")
    .orderBy("c.chunk_index", "asc")
    .limit(input.limit)
    .execute();

  const minSimilarity = input.minSimilarity ?? 0;
  return (rows as KnowledgeBaseChunkSearchResult[]).filter(
    (row) => row.similarity >= minSimilarity
  );
};
