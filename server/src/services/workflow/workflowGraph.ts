import { extractTemplateVariables } from "./templateRenderer.js";
import { nodeTypes } from "./nodeTypes.js";

export type EdgeData = {
  label?: string;
  condition?: string;
  transition_speech?: string | null;
};

export type ReactFlowNode = {
  id: string;
  type: string;
  data: Record<string, unknown>;
};

export type ReactFlowEdge = {
  id: string;
  source: string;
  target: string;
  data?: EdgeData;
};

export type ReactFlowDefinition = {
  nodes: ReactFlowNode[];
  edges: ReactFlowEdge[];
};

export type WorkflowValidationError = {
  kind: "workflow" | "node" | "edge";
  id: string | null;
  field: string | null;
  message: string;
};

export const validateWorkflowGraph = (
  definition: ReactFlowDefinition
): WorkflowValidationError[] => {
  const errors: WorkflowValidationError[] = [];
  const nodeIds = new Set(definition.nodes.map((node) => node.id));
  const startNodes = definition.nodes.filter((node) => node.type === nodeTypes.startNode);

  if (startNodes.length < 1) {
    errors.push({
      kind: "workflow",
      id: null,
      field: null,
      message: "Workflow must have at least one Start Call node"
    });
  }

  if (startNodes.length > 1) {
    errors.push({
      kind: "workflow",
      id: null,
      field: null,
      message: "Workflow can have at most one Start Call"
    });
  }

  for (const edge of definition.edges) {
    if (!nodeIds.has(edge.source)) {
      errors.push({
        kind: "edge",
        id: edge.id,
        field: "source",
        message: "Edge source node does not exist"
      });
    }
    if (!nodeIds.has(edge.target)) {
      errors.push({
        kind: "edge",
        id: edge.id,
        field: "target",
        message: "Edge target node does not exist"
      });
    }
  }

  return errors;
};

export const getRequiredTemplateVariables = (
  definition: ReactFlowDefinition
): Set<string> => {
  const variables = new Set<string>();

  for (const node of definition.nodes) {
    const prompt = node.data.prompt;
    const greeting = node.data.greeting;
    if (typeof prompt === "string") {
      for (const variable of extractTemplateVariables(prompt)) {
        variables.add(variable);
      }
    }
    if (node.type === nodeTypes.startNode && typeof greeting === "string") {
      for (const variable of extractTemplateVariables(greeting)) {
        variables.add(variable);
      }
    }
  }

  for (const edge of definition.edges) {
    if (typeof edge.data?.transition_speech === "string") {
      for (const variable of extractTemplateVariables(edge.data.transition_speech)) {
        variables.add(variable);
      }
    }
  }

  return variables;
};
