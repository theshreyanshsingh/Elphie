import { nodeTypes } from "./nodeTypes.js";

export const specVersion = "1.0.0";

export type NodeSpec = {
  name: string;
  display_name: string;
  category: string;
  description: string;
  graph_constraints?: {
    min_instances?: number;
    max_instances?: number;
  };
  properties: Array<Record<string, unknown>>;
  examples: Array<Record<string, unknown>>;
};

const coreSpecs: NodeSpec[] = [
  {
    name: nodeTypes.startNode,
    display_name: "Start Call",
    category: "call_node",
    description: "Entry point for a voice or text workflow.",
    graph_constraints: { min_instances: 1, max_instances: 1 },
    properties: [
      { name: "name", type: "string", display_name: "Name", description: "Node name." },
      {
        name: "prompt",
        type: "mention_textarea",
        display_name: "Prompt",
        description: "Initial system instructions for the call."
      },
      {
        name: "greeting",
        type: "mention_textarea",
        display_name: "Greeting",
        description: "Optional first assistant message."
      }
    ],
    examples: []
  },
  {
    name: nodeTypes.agentNode,
    display_name: "Agent",
    category: "call_node",
    description: "Conversational agent step with tools and transitions.",
    properties: [
      { name: "name", type: "string", display_name: "Name", description: "Node name." },
      {
        name: "prompt",
        type: "mention_textarea",
        display_name: "Prompt",
        description: "System instructions for this agent node."
      }
    ],
    examples: []
  },
  {
    name: nodeTypes.endNode,
    display_name: "End Call",
    category: "call_node",
    description: "Terminal workflow node.",
    properties: [
      { name: "name", type: "string", display_name: "Name", description: "Node name." },
      {
        name: "prompt",
        type: "mention_textarea",
        display_name: "Prompt",
        description: "Final assistant instructions before ending."
      }
    ],
    examples: []
  },
  {
    name: nodeTypes.globalNode,
    display_name: "Global",
    category: "global_node",
    description: "Shared instructions applied across the workflow.",
    graph_constraints: { max_instances: 1 },
    properties: [
      { name: "name", type: "string", display_name: "Name", description: "Node name." },
      {
        name: "prompt",
        type: "mention_textarea",
        display_name: "Prompt",
        description: "Global instructions."
      }
    ],
    examples: []
  },
  {
    name: nodeTypes.triggerNode,
    display_name: "Trigger",
    category: "trigger",
    description: "Public trigger path for inbound automation.",
    graph_constraints: { max_instances: 1 },
    properties: [],
    examples: []
  },
  {
    name: nodeTypes.webhookNode,
    display_name: "Webhook",
    category: "call_node",
    description: "HTTP webhook action node.",
    properties: [],
    examples: []
  },
  {
    name: nodeTypes.qaNode,
    display_name: "QA",
    category: "call_node",
    description: "Post-call quality analysis node.",
    properties: [],
    examples: []
  }
];

export const allNodeSpecs = (): NodeSpec[] =>
  [...coreSpecs].sort((a, b) => a.name.localeCompare(b.name));

export const getNodeSpec = (name: string): NodeSpec | undefined =>
  coreSpecs.find((spec) => spec.name === name);
