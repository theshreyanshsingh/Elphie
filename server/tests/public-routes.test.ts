import assert from "node:assert/strict";
import test from "node:test";
import { HttpError } from "../src/errors/httpError.js";
import {
  resolveWorkflowArtifact,
  triggerExistsInWorkflow,
  validateOrigin
} from "../src/routes/public.js";

test("public embed origin validation matches Python wildcard and www behavior", () => {
  assert.equal(validateOrigin("https://example.com", []), true);
  assert.equal(validateOrigin("https://www.example.com", ["example.com"]), true);
  assert.equal(validateOrigin("https://example.com", ["www.example.com"]), true);
  assert.equal(validateOrigin("https://app.example.com", ["*.example.com"]), true);
  assert.equal(validateOrigin("https://example.com", ["*.example.com"]), true);
  assert.equal(validateOrigin("https://example.com:3000", ["example.com:3000"]), true);
  assert.equal(validateOrigin("https://example.com:4000", ["example.com:3000"]), false);
  assert.equal(validateOrigin("https://evil.test", ["example.com"]), false);
});

test("public agent trigger lookup reads trigger_path from trigger node data", () => {
  const workflowJson = {
    nodes: [
      { id: "start", type: "start", data: {} },
      { id: "api", type: "trigger", data: { trigger_path: "trg-123" } }
    ]
  };

  assert.equal(triggerExistsInWorkflow(workflowJson, "trg-123"), true);
  assert.equal(triggerExistsInWorkflow(workflowJson, "trg-999"), false);
  assert.equal(triggerExistsInWorkflow({ nodes: "bad" }, "trg-123"), false);
});

test("public download artifact resolution supports legacy and split-track recordings", () => {
  const workflowRun = {
    recording_url: "recordings/10.wav",
    transcript_url: "transcripts/10.txt",
    storage_backend: "s3",
    extra: {
      recordings: {
        user: {
          storage_key: "recordings/10/user.wav",
          storage_backend: "minio"
        },
        bot: "recordings/10/bot.wav"
      }
    }
  } as any;

  assert.deepEqual(resolveWorkflowArtifact(workflowRun, "recording"), {
    filePath: "recordings/10.wav",
    storageBackend: "s3"
  });
  assert.deepEqual(resolveWorkflowArtifact(workflowRun, "transcript"), {
    filePath: "transcripts/10.txt",
    storageBackend: "s3"
  });
  assert.deepEqual(resolveWorkflowArtifact(workflowRun, "user_recording"), {
    filePath: "recordings/10/user.wav",
    storageBackend: "minio"
  });
  assert.deepEqual(resolveWorkflowArtifact(workflowRun, "bot_recording"), {
    filePath: "recordings/10/bot.wav",
    storageBackend: "s3"
  });
});

test("public download rejects unsupported artifact types", () => {
  assert.throws(
    () => resolveWorkflowArtifact({ extra: {} } as any, "other"),
    (err) => err instanceof HttpError && err.status === 400
  );
});
