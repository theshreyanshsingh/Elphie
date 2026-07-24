import type { RequestHandler, Router } from "express";
import { z } from "zod";
import { getCredential } from "../db/repositories/credentials.js";
import {
  archiveTool,
  createTool,
  getToolByUuid,
  listTools,
  type ToolRecord,
  unarchiveTool,
  updateTool
} from "../db/repositories/tools.js";
import { HttpError } from "../errors/httpError.js";
import { requireSelectedOrganization, requireUser } from "../middleware/auth.js";

const toolCategories = [
  "http_api",
  "end_call",
  "transfer_call",
  "calculator",
  "native",
  "integration",
  "mcp"
] as const;

const toolStatuses = ["active", "archived", "draft"] as const;

const toolDefinitionSchema = z
  .object({
    schema_version: z.number().int().positive().default(1),
    type: z.enum(toolCategories),
    config: z.record(z.unknown()).optional()
  })
  .passthrough();

const createToolSchema = z
  .object({
    name: z.string().max(255),
    description: z.string().nullable().optional(),
    category: z.enum(toolCategories).optional(),
    icon: z.string().max(50).nullable().optional().default("globe"),
    icon_color: z.string().max(7).nullable().optional().default("#3B82F6"),
    definition: toolDefinitionSchema
  })
  .transform((input) => ({
    ...input,
    category: input.category ?? input.definition.type
  }));

const updateToolSchema = z.object({
  name: z.string().max(255).optional(),
  description: z.string().nullable().optional(),
  icon: z.string().max(50).nullable().optional(),
  icon_color: z.string().max(7).nullable().optional(),
  definition: toolDefinitionSchema.optional(),
  status: z.enum(toolStatuses).optional()
});

const listQuerySchema = z.object({
  status: z.string().optional(),
  category: z.enum(toolCategories).optional()
});

export const validateToolStatusFilter = (status: string): void => {
  const statuses = status.split(",").map((value) => value.trim());
  for (const item of statuses) {
    if (!toolStatuses.includes(item as (typeof toolStatuses)[number])) {
      throw new HttpError(
        400,
        `Invalid status '${item}'. Must be one of: ${toolStatuses.join(", ")}`
      );
    }
  }
};

export const normalizeToolDefinition = (
  definition: Record<string, unknown>,
  category: string
): Record<string, unknown> => {
  if (definition.type !== category) {
    throw new HttpError(
      400,
      `category '${category}' must match definition.type '${String(definition.type)}'`
    );
  }

  if (definition.type === "http_api") {
    const config = definition.config;
    if (!config || typeof config !== "object" || Array.isArray(config)) {
      throw new HttpError(422, "HTTP API tool config is required");
    }
    const method = String((config as Record<string, unknown>).method ?? "").toUpperCase();
    if (!["GET", "POST", "PUT", "PATCH", "DELETE"].includes(method)) {
      throw new HttpError(422, "method must be one of GET, POST, PUT, PATCH, DELETE");
    }
    return {
      ...definition,
      config: {
        ...config,
        method
      }
    };
  }

  if (definition.type === "mcp") {
    const config = definition.config;
    if (!config || typeof config !== "object" || Array.isArray(config)) {
      throw new HttpError(422, "MCP tool config is required");
    }
    const url = (config as Record<string, unknown>).url;
    if (typeof url !== "string" || !url.startsWith("http://") && !url.startsWith("https://")) {
      throw new HttpError(422, "config.url must be an http(s) URL");
    }
    return {
      ...definition,
      config: {
        transport: "streamable_http",
        tools_filter: [],
        timeout_secs: 30,
        sse_read_timeout_secs: 300,
        discovered_tools: [],
        ...config
      }
    };
  }

  return definition;
};

const selectedOrganizationId = (req: Parameters<RequestHandler>[0]): number => {
  const organizationId = req.user?.selectedOrganizationId;
  if (!organizationId) {
    throw new HttpError(400, "No organization selected for the user");
  }
  return organizationId;
};

const credentialUuidFromDefinition = (
  definition: Record<string, unknown>
): string | null => {
  const config = definition.config;
  if (!config || typeof config !== "object" || Array.isArray(config)) {
    return null;
  }
  const credentialUuid = (config as Record<string, unknown>).credential_uuid;
  return typeof credentialUuid === "string" ? credentialUuid : null;
};

const validateCredentialReference = async (
  organizationId: number,
  definition: Record<string, unknown>
): Promise<void> => {
  const credentialUuid = credentialUuidFromDefinition(definition);
  if (!credentialUuid) {
    return;
  }
  const credential = await getCredential(organizationId, credentialUuid);
  if (!credential) {
    throw new HttpError(
      404,
      `Credential '${credentialUuid}' was not found in this organization. Create it in the UI first, then retry with its credential_uuid.`
    );
  }
};

export const toolResponse = (
  tool: ToolRecord,
  options: { includeCreatedBy?: boolean } = {}
) => ({
  id: tool.id,
  tool_uuid: tool.tool_uuid,
  name: tool.name,
  description: tool.description,
  category: tool.category,
  icon: tool.icon,
  icon_color: tool.icon_color,
  status: tool.status,
  definition: tool.definition,
  created_at: tool.created_at,
  updated_at: tool.updated_at,
  created_by:
    options.includeCreatedBy && tool.created_by_user_id
      ? {
          id: tool.created_by_user_id,
          provider_id: tool.created_by_user_provider_id
        }
      : null
});

const list: RequestHandler = async (req, res, next) => {
  try {
    const organizationId = selectedOrganizationId(req);
    const query = listQuerySchema.parse(req.query);
    if (query.status) {
      validateToolStatusFilter(query.status);
    }
    const tools = await listTools(organizationId, query);
    res.json(tools.map((tool) => toolResponse(tool)));
  } catch (err) {
    next(err);
  }
};

const create: RequestHandler = async (req, res, next) => {
  try {
    if (!req.user) throw new HttpError(401, "Unauthorized");
    const organizationId = selectedOrganizationId(req);
    const body = createToolSchema.parse(req.body);
    const definition = normalizeToolDefinition(body.definition, body.category);
    await validateCredentialReference(organizationId, definition);
    const tool = await createTool(organizationId, req.user.id, {
      name: body.name,
      description: body.description,
      category: body.category,
      icon: body.icon,
      iconColor: body.icon_color,
      definition
    });
    res.json(toolResponse(tool));
  } catch (err) {
    next(err);
  }
};

const getOne: RequestHandler = async (req, res, next) => {
  try {
    const tool = await getToolByUuid(
      selectedOrganizationId(req),
      String(req.params.tool_uuid),
      { includeArchived: true, includeCreatedBy: true }
    );
    if (!tool) throw new HttpError(404, "Tool not found");
    res.json(toolResponse(tool, { includeCreatedBy: true }));
  } catch (err) {
    next(err);
  }
};

const update: RequestHandler = async (req, res, next) => {
  try {
    const organizationId = selectedOrganizationId(req);
    const body = updateToolSchema.parse(req.body);
    const definition = body.definition
      ? normalizeToolDefinition(body.definition, body.definition.type)
      : undefined;
    if (definition) {
      await validateCredentialReference(organizationId, definition);
    }
    const tool = await updateTool(organizationId, String(req.params.tool_uuid), {
      name: body.name,
      description: body.description,
      definition,
      icon: body.icon,
      iconColor: body.icon_color,
      status: body.status
    });
    if (!tool) throw new HttpError(404, "Tool not found");
    res.json(toolResponse(tool, { includeCreatedBy: true }));
  } catch (err) {
    next(err);
  }
};

const remove: RequestHandler = async (req, res, next) => {
  try {
    const deleted = await archiveTool(
      selectedOrganizationId(req),
      String(req.params.tool_uuid)
    );
    if (!deleted) throw new HttpError(404, "Tool not found");
    res.json({ status: "archived", tool_uuid: req.params.tool_uuid });
  } catch (err) {
    next(err);
  }
};

const unarchive: RequestHandler = async (req, res, next) => {
  try {
    const tool = await unarchiveTool(
      selectedOrganizationId(req),
      String(req.params.tool_uuid)
    );
    if (!tool) throw new HttpError(404, "Tool not found");
    res.json(toolResponse(tool));
  } catch (err) {
    next(err);
  }
};

const refreshMcp: RequestHandler = async (req, res, next) => {
  try {
    const tool = await getToolByUuid(
      selectedOrganizationId(req),
      String(req.params.tool_uuid),
      { includeArchived: true }
    );
    if (!tool) throw new HttpError(404, "Tool not found");
    if (tool.category !== "mcp") {
      throw new HttpError(400, "Tool is not an MCP tool");
    }
    const definition =
      tool.definition && typeof tool.definition === "object" && !Array.isArray(tool.definition)
        ? (tool.definition as Record<string, unknown>)
        : {};
    const config =
      definition.config && typeof definition.config === "object" && !Array.isArray(definition.config)
        ? (definition.config as Record<string, unknown>)
        : {};
    const discoveredTools = Array.isArray(config.discovered_tools)
      ? config.discovered_tools
      : [];
    res.json({
      tool_uuid: tool.tool_uuid,
      discovered_tools: discoveredTools,
      error: discoveredTools.length
        ? null
        : "Could not reach the MCP server or it exposes no tools. Previously cached list retained."
    });
  } catch (err) {
    next(err);
  }
};

export const registerToolRoutes = (router: Router): void => {
  router.get("/tools/", requireUser, requireSelectedOrganization, list);
  router.post("/tools/", requireUser, requireSelectedOrganization, create);
  router.get("/tools/:tool_uuid", requireUser, requireSelectedOrganization, getOne);
  router.put("/tools/:tool_uuid", requireUser, requireSelectedOrganization, update);
  router.delete("/tools/:tool_uuid", requireUser, requireSelectedOrganization, remove);
  router.post(
    "/tools/:tool_uuid/mcp/refresh",
    requireUser,
    requireSelectedOrganization,
    refreshMcp
  );
  router.post(
    "/tools/:tool_uuid/unarchive",
    requireUser,
    requireSelectedOrganization,
    unarchive
  );
};
