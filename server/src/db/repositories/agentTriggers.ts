import { db } from "../database.js";
import type { AgentTriggerTable } from "../types.js";

export type AgentTriggerRecord = Omit<AgentTriggerTable, "id" | "created_at"> & {
  id: number;
  created_at: Date | string;
};

export const getAgentTriggerByPath = async (
  triggerPath: string,
  options: { activeOnly?: boolean } = {}
): Promise<AgentTriggerRecord | null> => {
  let query = db
    .selectFrom("agent_triggers")
    .selectAll()
    .where("trigger_path", "=", triggerPath);

  if (options.activeOnly ?? true) {
    query = query.where("state", "=", "active");
  }

  const row = await query.executeTakeFirst();
  return (row as unknown as AgentTriggerRecord | undefined) ?? null;
};
