import assert from "node:assert/strict";
import test from "node:test";
import {
  getRequiredTemplateVariables,
  validateWorkflowGraph,
  type ReactFlowDefinition
} from "../src/services/workflow/workflowGraph.js";

test("workflow graph detects missing edge targets", () => {
  const definition: ReactFlowDefinition = {
    nodes: [
      {
        id: "1",
        type: "startCall",
        data: { prompt: "Hello {{ name }}" }
      }
    ],
    edges: [{ id: "e1", source: "1", target: "missing" }]
  };

  const errors = validateWorkflowGraph(definition);
  assert.ok(errors.some((error) => error.field === "target"));
});

test("template variables skip nested, fallback, and system variables", () => {
  const variables = getRequiredTemplateVariables({
    nodes: [
      {
        id: "1",
        type: "startCall",
        data: {
          prompt:
            "Hello {{ name }} {{ gathered_context.city }} {{ provider }} {{ missing | fallback:friend }}"
        }
      }
    ],
    edges: []
  });

  assert.deepEqual([...variables], ["name"]);
});
