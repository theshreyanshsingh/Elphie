import assert from "node:assert/strict";
import test from "node:test";
import { HttpError } from "../src/errors/httpError.js";
import {
  extractLegacyWorkflowRunId,
  extractOrgIdFromKey,
  sanitizeCsvFileName,
  validateAndExtractWorkflowRunId
} from "../src/routes/s3.js";

test("S3 org-scoped storage keys extract organization IDs", () => {
  assert.equal(extractOrgIdFromKey("campaigns/42/leads.csv"), 42);
  assert.equal(extractOrgIdFromKey("knowledge_base/17/documents/a.txt"), 17);
  assert.equal(extractOrgIdFromKey("campaigns/nope/leads.csv"), null);
  assert.equal(extractOrgIdFromKey("recordings/123.wav"), null);
});

test("S3 legacy workflow-run keys match Python-compatible formats", () => {
  assert.equal(extractLegacyWorkflowRunId("transcripts/123.txt"), 123);
  assert.equal(extractLegacyWorkflowRunId("recordings/123.wav"), 123);
  assert.equal(extractLegacyWorkflowRunId("recordings/123/user.wav"), 123);
  assert.equal(extractLegacyWorkflowRunId("recordings/123/bot.wav"), 123);
  assert.equal(extractLegacyWorkflowRunId("recordings/123/other.wav"), null);
  assert.equal(extractLegacyWorkflowRunId("transcripts/not-a-number.txt"), null);
});

test("S3 metadata validation allows voicemail paths only for metadata", () => {
  assert.equal(validateAndExtractWorkflowRunId("transcripts/88.txt"), 88);
  assert.equal(validateAndExtractWorkflowRunId("recordings/88/bot.wav"), 88);
  assert.equal(
    validateAndExtractWorkflowRunId("voicemail_detections/88.json", {
      allowSpecialPaths: true
    }),
    null
  );
  assert.throws(
    () => validateAndExtractWorkflowRunId("voicemail_detections/88.json"),
    (err) => err instanceof HttpError && err.status === 400
  );
});

test("S3 CSV upload filenames are sanitized like the Python route", () => {
  assert.equal(
    sanitizeCsvFileName("June leads (north/east).csv"),
    "June_leads__north_east_.csv"
  );
  assert.equal(sanitizeCsvFileName("safe_file-1.2.csv"), "safe_file-1.2.csv");
});
