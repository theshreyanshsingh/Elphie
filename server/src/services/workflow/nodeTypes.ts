export const nodeTypes = {
  startNode: "startCall",
  agentNode: "agent",
  endNode: "endCall",
  globalNode: "global",
  triggerNode: "trigger",
  webhookNode: "webhook",
  qaNode: "qa"
} as const;

export type NodeType = (typeof nodeTypes)[keyof typeof nodeTypes] | string;
