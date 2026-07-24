import { sql } from "kysely";
import { randomUUID } from "node:crypto";
import { db } from "../database.js";
import type { EmbedSessionTable, EmbedTokenTable, JsonValue } from "../types.js";

export type EmbedTokenRecord = Omit<
  EmbedTokenTable,
  "id" | "created_at" | "updated_at" | "expires_at"
> & {
  id: number;
  created_at: Date | string;
  updated_at: Date | string | null;
  expires_at: Date | string | null;
};

export type EmbedSessionRecord = Omit<
  EmbedSessionTable,
  "id" | "created_at" | "expires_at"
> & {
  id: number;
  created_at: Date | string;
  expires_at: Date | string;
};

export const getEmbedTokenByToken = async (
  token: string
): Promise<EmbedTokenRecord | null> => {
  const row = await db
    .selectFrom("embed_tokens")
    .selectAll()
    .where("token", "=", token)
    .executeTakeFirst();
  return (row as unknown as EmbedTokenRecord | undefined) ?? null;
};

export const getEmbedTokenById = async (
  tokenId: number
): Promise<EmbedTokenRecord | null> => {
  const row = await db
    .selectFrom("embed_tokens")
    .selectAll()
    .where("id", "=", tokenId)
    .executeTakeFirst();
  return (row as unknown as EmbedTokenRecord | undefined) ?? null;
};

export const getEmbedTokensByWorkflow = async (input: {
  workflowId: number;
  organizationId: number;
  activeOnly?: boolean;
}): Promise<EmbedTokenRecord[]> => {
  let query = db
    .selectFrom("embed_tokens")
    .selectAll()
    .where("workflow_id", "=", input.workflowId)
    .where("organization_id", "=", input.organizationId)
    .orderBy("created_at", "desc");
  if (input.activeOnly ?? true) {
    query = query.where("is_active", "=", true);
  }
  const rows = await query.execute();
  return rows as unknown as EmbedTokenRecord[];
};

export const createEmbedToken = async (input: {
  workflowId: number;
  organizationId: number;
  createdBy: number;
  allowedDomains?: string[] | null;
  settings?: Record<string, unknown> | null;
  usageLimit?: number | null;
  expiresAt?: Date | null;
}): Promise<EmbedTokenRecord> => {
  const row = await db
    .insertInto("embed_tokens")
    .values({
      token: randomUUID(),
      workflow_id: input.workflowId,
      organization_id: input.organizationId,
      allowed_domains: input.allowedDomains ?? [],
      settings: input.settings ?? {},
      is_active: true,
      usage_limit: input.usageLimit ?? null,
      usage_count: 0,
      expires_at: input.expiresAt ?? null,
      created_by: input.createdBy,
      updated_at: null
    })
    .returningAll()
    .executeTakeFirstOrThrow();
  return row as unknown as EmbedTokenRecord;
};

export const updateEmbedToken = async (input: {
  tokenId: number;
  organizationId: number;
  allowedDomains?: string[] | null;
  settings?: Record<string, unknown> | null;
  usageLimit?: number | null;
  expiresAt?: Date | null;
  isActive?: boolean;
}): Promise<EmbedTokenRecord | null> => {
  const row = await db
    .updateTable("embed_tokens")
    .set({
      allowed_domains: input.allowedDomains ?? [],
      settings: input.settings ?? {},
      usage_limit: input.usageLimit ?? null,
      expires_at: input.expiresAt ?? null,
      is_active: input.isActive ?? true,
      updated_at: new Date()
    })
    .where("id", "=", input.tokenId)
    .where("organization_id", "=", input.organizationId)
    .returningAll()
    .executeTakeFirst();
  return (row as unknown as EmbedTokenRecord | undefined) ?? null;
};

export const deactivateEmbedToken = async (input: {
  tokenId: number;
  organizationId: number;
}): Promise<boolean> => {
  const result = await db
    .updateTable("embed_tokens")
    .set({ is_active: false, updated_at: new Date() })
    .where("id", "=", input.tokenId)
    .where("organization_id", "=", input.organizationId)
    .executeTakeFirst();
  return Number(result.numUpdatedRows) > 0;
};

export const incrementEmbedTokenUsage = async (
  tokenId: number
): Promise<void> => {
  await db
    .updateTable("embed_tokens")
    .set({ usage_count: sql<number>`usage_count + 1` })
    .where("id", "=", tokenId)
    .executeTakeFirst();
};

export const createEmbedSession = async (input: {
  sessionToken: string;
  embedTokenId: number;
  workflowRunId: number | null;
  clientIp: string | null;
  userAgent: string | null;
  origin: string | null;
  expiresAt: Date;
}): Promise<EmbedSessionRecord> => {
  const row = await db
    .insertInto("embed_sessions")
    .values({
      session_token: input.sessionToken,
      embed_token_id: input.embedTokenId,
      workflow_run_id: input.workflowRunId,
      client_ip: input.clientIp,
      user_agent: input.userAgent,
      origin: input.origin,
      expires_at: input.expiresAt
    })
    .returningAll()
    .executeTakeFirstOrThrow();
  return row as unknown as EmbedSessionRecord;
};

export const getEmbedSessionByToken = async (
  sessionToken: string
): Promise<EmbedSessionRecord | null> => {
  const row = await db
    .selectFrom("embed_sessions")
    .selectAll()
    .where("session_token", "=", sessionToken)
    .executeTakeFirst();
  return (row as unknown as EmbedSessionRecord | undefined) ?? null;
};

export const jsonObjectOrEmpty = (value: JsonValue | null | undefined): Record<string, unknown> =>
  value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};

export const stringArrayOrEmpty = (value: JsonValue | null | undefined): string[] => {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter((item): item is string => typeof item === "string");
};
