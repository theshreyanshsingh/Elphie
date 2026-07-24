import fs from "node:fs";
import path from "node:path";
import { Router, type RequestHandler } from "express";
import { allNodeSpecs, getNodeSpec } from "../services/workflow/nodeSpecs.js";
import { loadOpenApiSnapshot } from "../openapi/loadOpenApi.js";
import { HttpError } from "../errors/httpError.js";
import { validateApiKey } from "../db/repositories/apiKeys.js";
import {
  createWorkflow,
  getWorkflowByIdForOrg,
  getWorkflowDefinitionForExecution,
  listWorkflowsForOrg,
  saveWorkflowDraft
} from "../db/repositories/workflows.js";
import { listTools, createTool } from "../db/repositories/tools.js";
import { listCredentials } from "../db/repositories/credentials.js";
import { listKnowledgeBaseDocuments } from "../db/repositories/knowledgeBase.js";
import { listRecordings } from "../db/repositories/workflowRecordings.js";
import { repoPath } from "../utils/repoRoot.js";

type McpAuth = {
  organizationId: number;
  userId: number | null;
  apiKeyId: number;
};

declare module "express-serve-static-core" {
  interface Request {
    mcpAuth?: McpAuth;
  }
}

type JsonRpcRequest = {
  jsonrpc?: string;
  id?: string | number | null;
  method?: string;
  params?: Record<string, unknown>;
};

type McpTool = {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
};

const tools: McpTool[] = [
  {
    name: "create_workflow",
    description: "Create a Dograh workflow from a JSON workflow definition string.",
    inputSchema: {
      type: "object",
      properties: { code: { type: "string" }, name: { type: "string" } },
      required: ["code"]
    }
  },
  {
    name: "create_tool",
    description: "Create a Dograh custom tool in the authenticated organization.",
    inputSchema: {
      type: "object",
      properties: {
        request: { type: "object" },
        name: { type: "string" },
        description: { type: "string" },
        category: { type: "string" },
        definition: { type: "object" }
      }
    }
  },
  {
    name: "get_node_type",
    description: "Read one Dograh workflow node type specification.",
    inputSchema: {
      type: "object",
      properties: { name: { type: "string" } },
      required: ["name"]
    }
  },
  {
    name: "get_workflow",
    description: "Read a workflow in the authenticated organization.",
    inputSchema: {
      type: "object",
      properties: { workflow_id: { type: "number" } },
      required: ["workflow_id"]
    }
  },
  {
    name: "get_workflow_code",
    description: "Return the workflow definition as formatted JSON code.",
    inputSchema: {
      type: "object",
      properties: { workflow_id: { type: "number" } },
      required: ["workflow_id"]
    }
  },
  {
    name: "list_credentials",
    description: "List external credentials for the authenticated organization.",
    inputSchema: { type: "object", properties: {} }
  },
  {
    name: "list_documents",
    description: "List knowledge-base documents for the authenticated organization.",
    inputSchema: {
      type: "object",
      properties: {
        status: { type: "string" },
        limit: { type: "number" },
        offset: { type: "number" }
      }
    }
  },
  {
    name: "list_node_types",
    description: "List Dograh workflow node type specifications.",
    inputSchema: { type: "object", properties: {} }
  },
  {
    name: "list_recordings",
    description: "List reusable workflow recordings for the authenticated organization.",
    inputSchema: {
      type: "object",
      properties: { workflow_id: { type: "number" } }
    }
  },
  {
    name: "list_tools",
    description: "List custom tools for the authenticated organization.",
    inputSchema: {
      type: "object",
      properties: { status: { type: "string" }, category: { type: "string" } }
    }
  },
  {
    name: "list_workflows",
    description: "List workflows in the authenticated organization.",
    inputSchema: {
      type: "object",
      properties: { status: { type: "string" } }
    }
  },
  {
    name: "save_workflow",
    description: "Save a workflow draft from a JSON workflow definition string.",
    inputSchema: {
      type: "object",
      properties: {
        workflow_id: { type: "number" },
        code: { type: "string" }
      },
      required: ["workflow_id", "code"]
    }
  },
  {
    name: "get_voice_prompting_guide",
    description: "Return concise guidance for authoring Dograh voice prompts.",
    inputSchema: { type: "object", properties: {} }
  },
  {
    name: "list_docs",
    description: "List documentation pages from the local docs folder.",
    inputSchema: {
      type: "object",
      properties: { path: { type: "string" }, depth: { type: "number" } }
    }
  },
  {
    name: "read_doc",
    description: "Read a documentation page from the local docs folder.",
    inputSchema: {
      type: "object",
      properties: { path: { type: "string" }, section: { type: "string" } },
      required: ["path"]
    }
  },
  {
    name: "search_docs",
    description: "Search local Dograh documentation.",
    inputSchema: {
      type: "object",
      properties: { query: { type: "string" }, limit: { type: "number" } },
      required: ["query"]
    }
  },
  {
    name: "list_api_paths",
    description: "List documented Dograh API paths from the OpenAPI snapshot.",
    inputSchema: { type: "object", properties: {} }
  },
  {
    name: "read_api_path",
    description: "Read one documented Dograh API path from the OpenAPI snapshot.",
    inputSchema: {
      type: "object",
      properties: { path: { type: "string" } },
      required: ["path"]
    }
  }
];

const textContent = (value: unknown) => ({
  content: [
    {
      type: "text",
      text: typeof value === "string" ? value : JSON.stringify(value, null, 2)
    }
  ]
});

const requireMcpApiKey: RequestHandler = async (req, _res, next) => {
  const apiKey = req.header("x-api-key");
  if (!apiKey) {
    next(new HttpError(401, "X-API-Key header required"));
    return;
  }
  try {
    const record = await validateApiKey(apiKey);
    if (!record) {
      next(new HttpError(401, "Invalid or expired API key"));
      return;
    }
    req.mcpAuth = {
      organizationId: record.organization_id,
      userId: record.created_by,
      apiKeyId: record.id
    };
    next();
  } catch {
    next(new HttpError(401, "Invalid or expired API key"));
  }
};

const auth = (req: Parameters<RequestHandler>[0]): McpAuth => {
  if (!req.mcpAuth) {
    throw new HttpError(401, "MCP API key authentication required");
  }
  return req.mcpAuth;
};

const parseJsonCode = (code: unknown): Record<string, unknown> => {
  if (typeof code !== "string") {
    throw new HttpError(400, "code must be a JSON string");
  }
  const parsed = JSON.parse(code) as unknown;
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new HttpError(400, "code must parse to a workflow object");
  }
  return parsed as Record<string, unknown>;
};

const docFiles = (): string[] => {
  const docsRoot = repoPath("docs");
  const files: string[] = [];
  const walk = (dir: string): void => {
    if (!fs.existsSync(dir)) return;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(fullPath);
      } else if (/\.(md|mdx)$/.test(entry.name)) {
        files.push(path.relative(docsRoot, fullPath).replaceAll(path.sep, "/"));
      }
    }
  };
  walk(docsRoot);
  return files.sort();
};

const resolveDocPath = (routePath: string): string | null => {
  const normalized = routePath.replace(/^\/+/, "").replace(/\.(md|mdx)$/i, "");
  return (
    docFiles().find(
      (file) =>
        file.replace(/\.(md|mdx)$/i, "") === normalized ||
        `/${file.replace(/\.(md|mdx)$/i, "")}` === routePath
    ) ?? null
  );
};

const callTool = async (
  req: Parameters<RequestHandler>[0],
  name: string,
  args: Record<string, unknown> = {}
) => {
  if (name === "list_node_types") {
    return textContent({ node_types: allNodeSpecs() });
  }

  if (name === "get_node_type") {
    const spec = getNodeSpec(String(args.name ?? ""));
    if (!spec) {
      return {
        isError: true,
        ...textContent(`Unknown node type: ${String(args.name ?? "")}`)
      };
    }
    return textContent(spec);
  }

  if (name === "list_workflows") {
    const { organizationId } = auth(req);
    return textContent(
      await listWorkflowsForOrg(
        organizationId,
        typeof args.status === "string" ? args.status : undefined
      )
    );
  }

  if (name === "get_workflow" || name === "get_workflow_code") {
    const { organizationId } = auth(req);
    const workflowId = Number(args.workflow_id);
    const workflow = await getWorkflowByIdForOrg(workflowId, organizationId);
    if (!workflow) {
      return { isError: true, ...textContent(`Workflow ${workflowId} was not found`) };
    }
    const definition = await getWorkflowDefinitionForExecution(workflow, {
      useDraft: false
    });
    const workflowJson = definition?.workflow_json ?? workflow.workflow_definition;
    if (name === "get_workflow_code") {
      return textContent({ workflow_id: workflowId, code: JSON.stringify(workflowJson, null, 2) });
    }
    return textContent({ workflow, definition });
  }

  if (name === "create_workflow") {
    const { organizationId, userId } = auth(req);
    if (!userId) {
      return { isError: true, ...textContent("API key has no user for workflow creation") };
    }
    const workflowDefinition = parseJsonCode(args.code);
    const workflow = await createWorkflow({
      name: typeof args.name === "string" ? args.name : "MCP Workflow",
      workflowDefinition,
      organizationId,
      userId
    });
    return textContent({ workflow_id: workflow.id, workflow_uuid: workflow.workflow_uuid });
  }

  if (name === "save_workflow") {
    const { organizationId } = auth(req);
    const workflowId = Number(args.workflow_id);
    const workflow = await getWorkflowByIdForOrg(workflowId, organizationId);
    if (!workflow) {
      return { isError: true, ...textContent(`Workflow ${workflowId} was not found`) };
    }
    const definition = await saveWorkflowDraft({
      workflowId,
      workflowDefinition: parseJsonCode(args.code)
    });
    return textContent({ workflow_id: workflowId, draft_definition_id: definition.id });
  }

  if (name === "list_tools") {
    const { organizationId } = auth(req);
    return textContent(
      await listTools(organizationId, {
        status: typeof args.status === "string" ? args.status : undefined,
        category: typeof args.category === "string" ? args.category : undefined
      })
    );
  }

  if (name === "create_tool") {
    const { organizationId, userId } = auth(req);
    if (!userId) {
      return { isError: true, ...textContent("API key has no user for tool creation") };
    }
    const request = isPlainObject(args.request) ? args.request : args;
    const definition = isPlainObject(request.definition) ? request.definition : {};
    const tool = await createTool(organizationId, userId, {
      name: String(request.name ?? "MCP Tool"),
      description:
        typeof request.description === "string" ? request.description : null,
      category: String(request.category ?? "http_api"),
      definition
    });
    return textContent(tool);
  }

  if (name === "list_credentials") {
    const { organizationId } = auth(req);
    return textContent(await listCredentials(organizationId));
  }

  if (name === "list_documents") {
    const { organizationId } = auth(req);
    return textContent(
      await listKnowledgeBaseDocuments(organizationId, {
        status: typeof args.status === "string" ? args.status : null,
        limit: Number(args.limit ?? 50),
        offset: Number(args.offset ?? 0)
      })
    );
  }

  if (name === "list_recordings") {
    const { organizationId } = auth(req);
    return textContent(
      await listRecordings(organizationId, {
        workflowId:
          args.workflow_id == null ? null : Number(args.workflow_id)
      })
    );
  }

  if (name === "list_docs") {
    return textContent({ documents: docFiles() });
  }

  if (name === "read_doc") {
    const resolved = resolveDocPath(String(args.path ?? ""));
    if (!resolved) {
      return { isError: true, ...textContent(`Unknown docs path: ${String(args.path ?? "")}`) };
    }
    return textContent({
      path: resolved,
      content: fs.readFileSync(repoPath("docs", resolved), "utf8")
    });
  }

  if (name === "search_docs") {
    const query = String(args.query ?? "").toLowerCase();
    const limit = Number(args.limit ?? 5);
    const matches = docFiles()
      .map((file) => ({
        path: file,
        content: fs.readFileSync(repoPath("docs", file), "utf8")
      }))
      .map((doc) => ({
        path: doc.path,
        score:
          doc.path.toLowerCase().includes(query) || doc.content.toLowerCase().includes(query)
            ? 1
            : 0
      }))
      .filter((doc) => doc.score > 0)
      .slice(0, limit);
    return textContent({ results: matches });
  }

  if (name === "list_api_paths") {
    return textContent({ paths: Object.keys(loadOpenApiSnapshot().paths).sort() });
  }

  if (name === "read_api_path") {
    const apiPath = String(args.path ?? "");
    const item = loadOpenApiSnapshot().paths[apiPath];
    if (!item) {
      return { isError: true, ...textContent(`Unknown API path: ${apiPath}`) };
    }
    return textContent({ path: apiPath, item });
  }

  if (name === "get_voice_prompting_guide") {
    return textContent(
      "Write concise spoken instructions, keep transitions explicit, avoid visual UI language, and include only context variables the workflow actually provides."
    );
  }

  return { isError: true, ...textContent(`Unknown MCP tool: ${name}`) };
};

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  Boolean(value && typeof value === "object" && !Array.isArray(value));

const jsonRpcResponse = (
  request: JsonRpcRequest,
  result: Record<string, unknown>
) => ({
  jsonrpc: "2.0",
  id: request.id ?? null,
  result
});

const handleJsonRpc: RequestHandler = async (req, res, next) => {
  const request = req.body as JsonRpcRequest;

  try {
    if (request.method === "initialize") {
      res.json(
        jsonRpcResponse(request, {
          protocolVersion: "2024-11-05",
          serverInfo: { name: "dograh", version: "1.37.0" },
          capabilities: { tools: {} }
        })
      );
      return;
    }

    if (request.method === "tools/list") {
      res.json(jsonRpcResponse(request, { tools }));
      return;
    }

    if (request.method === "tools/call") {
      const params = request.params ?? {};
      res.json(
        jsonRpcResponse(
          request,
          await callTool(
            req,
            String(params.name ?? ""),
            (params.arguments as Record<string, unknown> | undefined) ?? {}
          )
        )
      );
      return;
    }

    res.status(400).json({
      jsonrpc: "2.0",
      id: request.id ?? null,
      error: {
        code: -32601,
        message: `Unknown MCP method: ${String(request.method ?? "")}`
      }
    });
  } catch (error) {
    next(error);
  }
};

export const registerMcpRouter = (apiRouter: Router): void => {
  const router = Router();
  router.use(requireMcpApiKey);
  router.get("/", (_req, res) => {
    res.json({
      name: "dograh",
      transport: "streamable_http",
      auth: "x-api-key",
      tools: tools.map((tool) => tool.name)
    });
  });
  router.post("/", handleJsonRpc);
  router.delete("/", (_req, res) => {
    res.status(202).json({ status: "closed" });
  });
  router.all("/*", handleJsonRpc);
  apiRouter.use("/mcp", router);
};
