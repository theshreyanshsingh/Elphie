import { randomUUID } from "node:crypto";
import type { JsonValue } from "../types.js";
import { db } from "../database.js";

export type ToolRecord = {
  id: number;
  tool_uuid: string;
  organization_id: number;
  name: string;
  description: string | null;
  category: string;
  icon: string | null;
  icon_color: string | null;
  status: string;
  definition: JsonValue;
  created_by: number;
  created_at: Date | string;
  updated_at: Date | string | null;
  created_by_user_id?: number | null;
  created_by_user_provider_id?: string | null;
};

export type ToolUpdate = {
  name?: string;
  description?: string | null;
  definition?: Record<string, unknown>;
  icon?: string | null;
  iconColor?: string | null;
  status?: string;
};

const asTool = (row: unknown): ToolRecord => row as ToolRecord;

export const listTools = async (
  organizationId: number,
  filters: { status?: string | null; category?: string | null } = {}
): Promise<ToolRecord[]> => {
  let query = db
    .selectFrom("tools")
    .selectAll()
    .where("organization_id", "=", organizationId);

  if (filters.status) {
    const statuses = filters.status.split(",").map((status) => status.trim());
    query =
      statuses.length > 1
        ? query.where("status", "in", statuses)
        : query.where("status", "=", statuses[0]);
  } else {
    query = query.where("status", "!=", "archived");
  }

  if (filters.category) {
    query = query.where("category", "=", filters.category);
  }

  const rows = await query.orderBy("name", "asc").execute();
  return rows.map(asTool);
};

export const createTool = async (
  organizationId: number,
  userId: number,
  input: {
    name: string;
    description?: string | null;
    category: string;
    icon?: string | null;
    iconColor?: string | null;
    definition: Record<string, unknown>;
  }
): Promise<ToolRecord> => {
  const row = await db
    .insertInto("tools")
    .values({
      tool_uuid: randomUUID(),
      organization_id: organizationId,
      created_by: userId,
      name: input.name,
      description: input.description ?? null,
      category: input.category,
      icon: input.icon ?? null,
      icon_color: input.iconColor ?? null,
      definition: input.definition,
      status: "active"
    })
    .returningAll()
    .executeTakeFirstOrThrow();
  return asTool(row);
};

export const getToolByUuid = async (
  organizationId: number,
  toolUuid: string,
  options: { includeArchived?: boolean; includeCreatedBy?: boolean } = {}
): Promise<ToolRecord | null> => {
  let query = options.includeCreatedBy
    ? db
        .selectFrom("tools")
        .leftJoin("users", "tools.created_by", "users.id")
        .select([
          "tools.id as id",
          "tools.tool_uuid as tool_uuid",
          "tools.organization_id as organization_id",
          "tools.name as name",
          "tools.description as description",
          "tools.category as category",
          "tools.icon as icon",
          "tools.icon_color as icon_color",
          "tools.status as status",
          "tools.definition as definition",
          "tools.created_by as created_by",
          "tools.created_at as created_at",
          "tools.updated_at as updated_at",
          "users.id as created_by_user_id",
          "users.provider_id as created_by_user_provider_id"
        ])
    : db.selectFrom("tools").selectAll();

  query = query
    .where("tools.organization_id", "=", organizationId)
    .where("tools.tool_uuid", "=", toolUuid);

  if (!options.includeArchived) {
    query = query.where("tools.status", "!=", "archived");
  }

  const row = await query.executeTakeFirst();
  return row ? asTool(row) : null;
};

export const updateTool = async (
  organizationId: number,
  toolUuid: string,
  input: ToolUpdate
): Promise<ToolRecord | null> => {
  const set: Record<string, unknown> = { updated_at: new Date() };
  if (input.name !== undefined) set.name = input.name;
  if (input.description !== undefined) set.description = input.description;
  if (input.definition !== undefined) set.definition = input.definition;
  if (input.icon !== undefined) set.icon = input.icon;
  if (input.iconColor !== undefined) set.icon_color = input.iconColor;
  if (input.status !== undefined) set.status = input.status;

  const row = await db
    .updateTable("tools")
    .set(set)
    .where("organization_id", "=", organizationId)
    .where("tool_uuid", "=", toolUuid)
    .returningAll()
    .executeTakeFirst();

  if (!row) {
    return null;
  }
  return getToolByUuid(organizationId, toolUuid, {
    includeArchived: true,
    includeCreatedBy: true
  });
};

export const archiveTool = async (
  organizationId: number,
  toolUuid: string
): Promise<boolean> => {
  const result = await db
    .updateTable("tools")
    .set({ status: "archived", updated_at: new Date() })
    .where("organization_id", "=", organizationId)
    .where("tool_uuid", "=", toolUuid)
    .where("status", "!=", "archived")
    .executeTakeFirst();
  return Number(result.numUpdatedRows) > 0;
};

export const unarchiveTool = async (
  organizationId: number,
  toolUuid: string
): Promise<ToolRecord | null> => {
  const result = await db
    .updateTable("tools")
    .set({ status: "active", updated_at: new Date() })
    .where("organization_id", "=", organizationId)
    .where("tool_uuid", "=", toolUuid)
    .where("status", "=", "archived")
    .executeTakeFirst();

  if (Number(result.numUpdatedRows) === 0) {
    return null;
  }
  return getToolByUuid(organizationId, toolUuid, { includeArchived: true });
};
