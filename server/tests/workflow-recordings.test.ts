import assert from "node:assert/strict";
import test from "node:test";
import { generateShortRecordingId } from "../src/db/repositories/workflowRecordings.js";
import { recordingResponse } from "../src/routes/workflowRecordings.js";

test("workflow recording short IDs are lowercase alphanumeric", () => {
  const id = generateShortRecordingId(8);
  assert.match(id, /^[a-z0-9]{8}$/);
});

test("workflow recording response maps recording_metadata to metadata", () => {
  const response = recordingResponse({
    id: 1,
    recording_id: "intro",
    workflow_id: null,
    organization_id: 42,
    tts_provider: "elevenlabs",
    tts_model: "turbo",
    tts_voice_id: "voice-1",
    transcript: "Hello",
    storage_key: "recordings/42/intro/hello.wav",
    storage_backend: "minio",
    recording_metadata: { duration_seconds: 3 },
    created_by: 7,
    created_at: "2026-01-01T00:00:00Z",
    is_active: true
  });

  assert.deepEqual(response.metadata, { duration_seconds: 3 });
  assert.equal(response.recording_id, "intro");
  assert.equal(response.storage_backend, "minio");
});
