import { randomUUID } from "node:crypto";
import {
  ensureRuntimeSession,
  executeRuntimeTextTurn,
  runtimeSessionId
} from "./runtime.js";

export type TextChatTurn = {
  id: string;
  role: "user" | "assistant";
  text: string;
  created_at: string;
  metadata?: Record<string, unknown>;
};

export const executeTextChatTurn = (input: {
  userText: string;
  priorTurns: TextChatTurn[];
  workflowName?: string | null;
  workflowRunId?: number | null;
  workflowId?: number | null;
  workflowDefinition?: Record<string, unknown> | null;
  runtimeContext?: Record<string, unknown>;
}): {
  assistantTurn: TextChatTurn;
  gatheredContextPatch: Record<string, unknown>;
  completed: boolean;
} => {
  const session = ensureRuntimeSession({
    id: runtimeSessionId({
      modality: "text",
      workflowRunId: input.workflowRunId ?? null
    }),
    modality: "text",
    workflowRunId: input.workflowRunId ?? null,
    workflowId: input.workflowId ?? null,
    context: {
      ...(input.runtimeContext ?? {}),
      prior_turn_count: input.priorTurns.length
    }
  });
  const runtimeResult = executeRuntimeTextTurn({
    session,
    userText: input.userText,
    workflowName: input.workflowName,
    workflowDefinition: input.workflowDefinition,
    context: input.runtimeContext
  });

  return {
    assistantTurn: {
      id: randomUUID(),
      role: "assistant",
      text: runtimeResult.assistantText,
      created_at: runtimeResult.event.created_at,
      metadata: {
        runtime: "node_text_chat",
        runtime_session_id: session.id,
        runtime_event_id: runtimeResult.event.id,
        turn_index: input.priorTurns.length + 1
      }
    },
    gatheredContextPatch: runtimeResult.contextPatch,
    completed: runtimeResult.completed
  };
};
