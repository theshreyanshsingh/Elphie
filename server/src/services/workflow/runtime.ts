import { randomUUID } from "node:crypto";
import { nodeTypes } from "./nodeTypes.js";
import { renderTemplate } from "./templateRenderer.js";
import type {
  ReactFlowDefinition,
  ReactFlowEdge,
  ReactFlowNode
} from "./workflowGraph.js";

export type RuntimeModality = "text" | "telephony" | "webrtc" | "agent_stream";

export type RuntimeEvent = {
  id: string;
  type: string;
  modality: RuntimeModality;
  created_at: string;
  payload: Record<string, unknown>;
};

export type RuntimeSession = {
  id: string;
  workflowRunId: number | null;
  workflowId: number | null;
  userId: number | null;
  modality: RuntimeModality;
  status: "initialized" | "running" | "completed" | "failed" | "cancelled";
  created_at: string;
  updated_at: string;
  events: RuntimeEvent[];
  context: Record<string, unknown>;
};

export type TextTurnResult = {
  assistantText: string;
  event: RuntimeEvent;
  contextPatch: Record<string, unknown>;
  completed: boolean;
};

const sessions = new Map<string, RuntimeSession>();

const now = (): string => new Date().toISOString();

const event = (
  type: string,
  modality: RuntimeModality,
  payload: Record<string, unknown>
): RuntimeEvent => ({
  id: randomUUID(),
  type,
  modality,
  created_at: now(),
  payload
});

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value && typeof value === "object" && !Array.isArray(value));

const asWorkflowDefinition = (
  value: unknown
): ReactFlowDefinition | null => {
  if (!isRecord(value)) return null;
  const nodes = value.nodes;
  const edges = value.edges;
  if (!Array.isArray(nodes) || !Array.isArray(edges)) return null;
  return {
    nodes: nodes.filter(isRecord) as ReactFlowNode[],
    edges: edges.filter(isRecord) as ReactFlowEdge[]
  };
};

const textAt = (
  value: Record<string, unknown>,
  keys: string[]
): string | null => {
  for (const key of keys) {
    const candidate = value[key];
    if (typeof candidate === "string" && candidate.trim()) {
      return candidate;
    }
  }
  return null;
};

const dataFor = (node: ReactFlowNode | null | undefined): Record<string, unknown> =>
  isRecord(node?.data) ? node.data : {};

const outgoingFor = (
  definition: ReactFlowDefinition,
  nodeId: string
): ReactFlowEdge[] => definition.edges.filter((edge) => edge.source === nodeId);

const matchText = (haystack: string, needle: unknown): boolean => {
  if (typeof needle !== "string") return false;
  const normalized = needle.trim().toLowerCase();
  if (!normalized) return false;
  return haystack.includes(normalized);
};

const chooseTransition = (
  definition: ReactFlowDefinition,
  source: ReactFlowNode,
  userText: string
): ReactFlowEdge | null => {
  const outgoing = outgoingFor(definition, source.id);
  if (outgoing.length === 0) return null;
  const lowered = userText.toLowerCase();
  const endEdge = outgoing.find((edge) => {
    const target = definition.nodes.find((node) => node.id === edge.target);
    return (
      target?.type === nodeTypes.endNode &&
      (/\b(bye|goodbye|done|end|stop|hang\s*up|no thanks)\b/i.test(userText) ||
        matchText(lowered, edge.data?.label) ||
        matchText(lowered, edge.data?.condition))
    );
  });
  if (endEdge) return endEdge;
  return (
    outgoing.find(
      (edge) =>
        matchText(lowered, edge.data?.label) ||
        matchText(lowered, edge.data?.condition)
    ) ?? outgoing[0] ?? null
  );
};

const firstStartNode = (
  definition: ReactFlowDefinition
): ReactFlowNode | null =>
  definition.nodes.find((node) => node.type === nodeTypes.startNode) ??
  definition.nodes[0] ??
  null;

const nodeById = (
  definition: ReactFlowDefinition,
  nodeId: unknown
): ReactFlowNode | null =>
  typeof nodeId === "string"
    ? definition.nodes.find((node) => node.id === nodeId) ?? null
    : null;

const promptForNode = (
  definition: ReactFlowDefinition,
  node: ReactFlowNode,
  context: Record<string, unknown>,
  options: { firstTurn: boolean; userText: string; workflowName?: string | null }
): string => {
  const data = dataFor(node);
  const globalNode = definition.nodes.find((candidate) => candidate.type === nodeTypes.globalNode);
  const globalPrompt = textAt(dataFor(globalNode), ["prompt"]);
  const rawPrompt =
    node.type === nodeTypes.startNode && options.firstTurn
      ? textAt(data, ["greeting", "prompt"])
      : textAt(data, ["prompt", "message", "name"]);
  const parts = [
    data.add_global_prompt === false ? null : globalPrompt,
    rawPrompt
  ].filter((part): part is string => Boolean(part));
  const rendered = parts.map((part) => renderTemplate(part, context)).join("\n\n").trim();
  if (rendered) return rendered;
  if (node.type === nodeTypes.endNode) return "Thanks for your time. Goodbye.";
  return options.workflowName && options.workflowName.trim()
    ? `${options.workflowName} received: ${options.userText}`
    : `Received: ${options.userText}`;
};

const coerceExtractedValue = (
  type: unknown,
  userText: string,
  variableName: string
): unknown => {
  const loweredName = variableName.replace(/[_-]/g, "[\\s_-]?");
  const explicit = userText.match(new RegExp(`${loweredName}\\s*(?:is|=|:)\\s*([^,.\\n]+)`, "i"));
  const raw = explicit?.[1]?.trim();
  if ((type === "number" || type === "integer") && raw) {
    const numeric = Number(raw.replace(/[^0-9.-]/g, ""));
    return Number.isFinite(numeric) ? numeric : raw;
  }
  if (type === "boolean") {
    if (/\b(yes|true|confirmed|interested)\b/i.test(raw ?? userText)) return true;
    if (/\b(no|false|declined|not interested)\b/i.test(raw ?? userText)) return false;
  }
  if (raw) return raw;
  if (type === "number" || type === "integer") {
    const numeric = userText.match(/[-+]?\d+(?:\.\d+)?/);
    return numeric ? Number(numeric[0]) : null;
  }
  return null;
};

const extractVariables = (
  node: ReactFlowNode,
  userText: string,
  existing: Record<string, unknown>
): Record<string, unknown> => {
  const data = dataFor(node);
  if (data.extraction_enabled !== true || !Array.isArray(data.extraction_variables)) {
    return {};
  }
  const extracted: Record<string, unknown> = {};
  for (const variable of data.extraction_variables) {
    if (!isRecord(variable) || typeof variable.name !== "string") continue;
    const value = coerceExtractedValue(variable.type, userText, variable.name);
    if (value != null) {
      extracted[variable.name] = value;
    } else if (existing[variable.name] != null) {
      extracted[variable.name] = existing[variable.name];
    }
  }
  return extracted;
};

const executeGraphTurn = (input: {
  session: RuntimeSession;
  userText: string;
  workflowName?: string | null;
  workflowDefinition?: Record<string, unknown> | null;
  context?: Record<string, unknown>;
}): {
  assistantText: string;
  activeNode: ReactFlowNode | null;
  nextNode: ReactFlowNode | null;
  transition: ReactFlowEdge | null;
  contextPatch: Record<string, unknown>;
  completed: boolean;
} | null => {
  const definition = asWorkflowDefinition(input.workflowDefinition);
  if (!definition) return null;
  const mergedContext = {
    ...input.context,
    ...input.session.context,
    last_user_message: input.userText
  };
  const firstTurn = !input.session.events.some((item) => item.type === "text_turn");
  const startNode = firstStartNode(definition);
  if (!startNode) return null;

  const activeNode =
    nodeById(definition, input.session.context.active_node_id) ?? startNode;
  const transition = chooseTransition(definition, activeNode, input.userText);
  const nextNode = transition ? nodeById(definition, transition.target) : activeNode;
  const responseNode = nextNode ?? activeNode;
  const extracted = {
    ...extractVariables(activeNode, input.userText, mergedContext),
    ...extractVariables(responseNode, input.userText, mergedContext)
  };
  const existingExtracted = isRecord(input.session.context.extracted_variables)
    ? input.session.context.extracted_variables
    : {};
  const completed = responseNode.type === nodeTypes.endNode || outgoingFor(definition, responseNode.id).length === 0;
  const nodeHistory = Array.isArray(input.session.context.node_history)
    ? input.session.context.node_history
    : [];

  return {
    assistantText: promptForNode(definition, responseNode, {
      ...mergedContext,
      extracted_variables: { ...existingExtracted, ...extracted },
      ...extracted
    }, {
      firstTurn,
      userText: input.userText,
      workflowName: input.workflowName
    }),
    activeNode,
    nextNode: responseNode,
    transition,
    completed,
    contextPatch: {
      active_node_id: completed ? null : responseNode.id,
      last_node_id: responseNode.id,
      last_node_type: responseNode.type,
      last_transition_id: transition?.id ?? null,
      node_history: [
        ...nodeHistory,
        {
          node_id: responseNode.id,
          node_type: responseNode.type,
          at: now()
        }
      ],
      extracted_variables: {
        ...existingExtracted,
        ...extracted
      }
    }
  };
};

export const runtimeSessionId = (input: {
  modality: RuntimeModality;
  workflowRunId?: number | null;
  channel?: string | null;
}): string =>
  input.workflowRunId != null
    ? `${input.modality}:run:${input.workflowRunId}`
    : `${input.modality}:channel:${input.channel ?? "default"}`;

export const ensureRuntimeSession = (input: {
  id: string;
  modality: RuntimeModality;
  workflowRunId?: number | null;
  workflowId?: number | null;
  userId?: number | null;
  context?: Record<string, unknown>;
}): RuntimeSession => {
  const existing = sessions.get(input.id);
  if (existing) {
    if (input.context) {
      existing.context = { ...existing.context, ...input.context };
      existing.updated_at = now();
    }
    return existing;
  }

  const createdAt = now();
  const session: RuntimeSession = {
    id: input.id,
    workflowRunId: input.workflowRunId ?? null,
    workflowId: input.workflowId ?? null,
    userId: input.userId ?? null,
    modality: input.modality,
    status: "initialized",
    created_at: createdAt,
    updated_at: createdAt,
    events: [],
    context: input.context ?? {}
  };
  sessions.set(input.id, session);
  return session;
};

export const appendRuntimeEvent = (
  session: RuntimeSession,
  runtimeEvent: RuntimeEvent
): RuntimeSession => {
  session.events.push(runtimeEvent);
  session.status = runtimeEvent.type === "stop" ? "completed" : "running";
  session.updated_at = runtimeEvent.created_at;
  session.context = {
    ...session.context,
    last_event_type: runtimeEvent.type,
    last_event_at: runtimeEvent.created_at
  };
  return session;
};

export const executeRuntimeTextTurn = (input: {
  session: RuntimeSession;
  userText: string;
  workflowName?: string | null;
  workflowDefinition?: Record<string, unknown> | null;
  context?: Record<string, unknown>;
}): TextTurnResult => {
  const graphResult = executeGraphTurn(input);
  const assistantText =
    graphResult?.assistantText ??
    (input.workflowName && input.workflowName.trim()
      ? `${input.workflowName} received: ${input.userText}`
      : `Received: ${input.userText}`);
  const runtimeEvent = event("text_turn", "text", {
    user_text: input.userText,
    assistant_text: assistantText,
    active_node_id: graphResult?.activeNode?.id ?? null,
    next_node_id: graphResult?.nextNode?.id ?? null,
    transition_id: graphResult?.transition?.id ?? null,
    completed: graphResult?.completed ?? false
  });
  appendRuntimeEvent(input.session, runtimeEvent);
  const contextPatch = {
    ...(graphResult?.contextPatch ?? {}),
    last_text_chat_message: input.userText,
    last_text_chat_response: assistantText,
    last_text_chat_turn_at: runtimeEvent.created_at,
    runtime_session_id: input.session.id
  };
  input.session.context = { ...input.session.context, ...contextPatch };
  if (graphResult?.completed) {
    input.session.status = "completed";
  }
  return {
    assistantText,
    event: runtimeEvent,
    contextPatch,
    completed: graphResult?.completed ?? false
  };
};

export const handleRuntimeMediaEvent = (input: {
  session: RuntimeSession;
  type: string;
  payload: Record<string, unknown>;
}): RuntimeEvent => {
  const runtimeEvent = event(input.type, input.session.modality, input.payload);
  appendRuntimeEvent(input.session, runtimeEvent);
  return runtimeEvent;
};

export const getRuntimeSession = (id: string): RuntimeSession | null =>
  sessions.get(id) ?? null;

export const clearRuntimeSessionsForTests = (): void => {
  sessions.clear();
};
