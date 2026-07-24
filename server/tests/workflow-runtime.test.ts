import assert from "node:assert/strict";
import test from "node:test";
import {
  clearRuntimeSessionsForTests,
  ensureRuntimeSession,
  executeRuntimeTextTurn,
  getRuntimeSession,
  handleRuntimeMediaEvent,
  runtimeSessionId
} from "../src/services/workflow/runtime.js";

test("runtime sessions are keyed by modality and workflow run", () => {
  clearRuntimeSessionsForTests();
  const id = runtimeSessionId({ modality: "text", workflowRunId: 123 });
  const session = ensureRuntimeSession({
    id,
    modality: "text",
    workflowRunId: 123,
    workflowId: 12
  });

  assert.equal(id, "text:run:123");
  assert.equal(getRuntimeSession(id), session);
  assert.equal(session.status, "initialized");
});

test("text runtime turn records assistant response and context patch", () => {
  clearRuntimeSessionsForTests();
  const session = ensureRuntimeSession({
    id: runtimeSessionId({ modality: "text", workflowRunId: 99 }),
    modality: "text",
    workflowRunId: 99
  });
  const result = executeRuntimeTextTurn({
    session,
    userText: "hello",
    workflowName: "Support"
  });

  assert.equal(result.assistantText, "Support received: hello");
  assert.equal(result.contextPatch.last_text_chat_message, "hello");
  assert.equal(session.status, "running");
  assert.equal(session.events.length, 1);
  assert.equal(session.events[0]?.type, "text_turn");
});

test("media runtime stop event completes the session", () => {
  clearRuntimeSessionsForTests();
  const session = ensureRuntimeSession({
    id: runtimeSessionId({ modality: "telephony", workflowRunId: 77 }),
    modality: "telephony",
    workflowRunId: 77
  });
  handleRuntimeMediaEvent({
    session,
    type: "start",
    payload: { streamSid: "stream-1" }
  });
  handleRuntimeMediaEvent({
    session,
    type: "stop",
    payload: { streamSid: "stream-1" }
  });

  assert.equal(session.status, "completed");
  assert.equal(session.events.map((event) => event.type).join(","), "start,stop");
});

test("text runtime executes workflow graph transitions and extraction", () => {
  clearRuntimeSessionsForTests();
  const session = ensureRuntimeSession({
    id: runtimeSessionId({ modality: "text", workflowRunId: 44 }),
    modality: "text",
    workflowRunId: 44,
    context: { first_name: "Ava" }
  });
  const definition = {
    nodes: [
      {
        id: "start",
        type: "startCall",
        data: { greeting: "Hi {{first_name}}" }
      },
      {
        id: "qualify",
        type: "agent",
        data: {
          prompt: "What budget should I record?",
          extraction_enabled: true,
          extraction_variables: [{ name: "budget", type: "number" }]
        }
      },
      {
        id: "end",
        type: "endCall",
        data: { prompt: "Recorded {{extracted_variables.budget}}. Goodbye." }
      }
    ],
    edges: [
      { id: "e1", source: "start", target: "qualify" },
      { id: "e2", source: "qualify", target: "end", data: { label: "done" } }
    ]
  };

  const first = executeRuntimeTextTurn({
    session,
    userText: "hello",
    workflowName: "Sales",
    workflowDefinition: definition
  });
  assert.equal(first.assistantText, "What budget should I record?");
  assert.equal(first.contextPatch.active_node_id, "qualify");
  assert.equal(first.completed, false);

  const second = executeRuntimeTextTurn({
    session,
    userText: "budget is 1200 and done",
    workflowName: "Sales",
    workflowDefinition: definition
  });
  assert.equal(second.assistantText, "Recorded 1200. Goodbye.");
  assert.equal(second.contextPatch.active_node_id, null);
  assert.equal(second.completed, true);
  assert.deepEqual(second.contextPatch.extracted_variables, { budget: 1200 });
  assert.equal(session.status, "completed");
});
