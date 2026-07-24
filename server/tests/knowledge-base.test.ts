import assert from "node:assert/strict";
import test from "node:test";
import { documentResponse } from "../src/routes/knowledgeBase.js";

test("knowledge base document response fills Python default fields", () => {
  const response = documentResponse({
    id: 1,
    document_uuid: "doc-1",
    organization_id: 42,
    filename: "guide.pdf",
    file_size_bytes: null,
    file_hash: null,
    mime_type: null,
    processing_status: "pending",
    processing_error: null,
    total_chunks: 0,
    retrieval_mode: "chunked",
    custom_metadata: { s3_key: "knowledge_base/42/doc-1/guide.pdf" },
    docling_metadata: null,
    source_url: null,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    created_by: 7,
    is_active: true
  });

  assert.equal(response.file_size_bytes, 0);
  assert.equal(response.file_hash, "");
  assert.equal(response.mime_type, "application/octet-stream");
  assert.deepEqual(response.docling_metadata, {});
});
