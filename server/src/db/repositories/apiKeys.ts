import { db } from "../database.js";
import type { APIKeyTable } from "../types.js";
import { hashApiKey } from "../../services/auth/apiKey.js";
import crypto from "node:crypto";

export type APIKeyRecord = Omit<
  APIKeyTable,
  "id" | "created_at" | "last_used_at" | "archived_at"
> & {
  id: number;
  created_at: Date | string;
  last_used_at: Date | string | null;
  archived_at: Date | string | null;
};

export const getApiKeyByHash = async (
  keyHash: string
): Promise<APIKeyRecord | null> => {
  const row = await db
    .selectFrom("api_keys")
    .selectAll()
    .where("key_hash", "=", keyHash)
    .where("is_active", "=", true)
    .where("archived_at", "is", null)
    .executeTakeFirst();
  return (row as unknown as APIKeyRecord | undefined) ?? null;
};

export const validateApiKey = async (
  rawApiKey: string
): Promise<APIKeyRecord | null> => {
  const key = await getApiKeyByHash(hashApiKey(rawApiKey));
  if (!key) {
    return null;
  }

  await db
    .updateTable("api_keys")
    .set({ last_used_at: new Date() })
    .where("id", "=", key.id)
    .executeTakeFirst();

  return key;
};

export const generateApiKey = (): {
  rawApiKey: string;
  keyHash: string;
  keyPrefix: string;
} => {
  const rawApiKey = `dgr_${crypto.randomBytes(32).toString("base64url")}`;
  return {
    rawApiKey,
    keyHash: hashApiKey(rawApiKey),
    keyPrefix: rawApiKey.slice(0, 8)
  };
};

export const listApiKeys = async (
  organizationId: number,
  includeArchived: boolean
): Promise<APIKeyRecord[]> => {
  let query = db
    .selectFrom("api_keys")
    .selectAll()
    .where("organization_id", "=", organizationId);

  if (!includeArchived) {
    query = query.where("archived_at", "is", null);
  }

  const rows = await query.orderBy("created_at", "desc").execute();
  return rows as unknown as APIKeyRecord[];
};

export const createApiKey = async (
  organizationId: number,
  name: string,
  createdBy: number
): Promise<{ apiKey: APIKeyRecord; rawApiKey: string }> => {
  const generated = generateApiKey();
  const row = await db
    .insertInto("api_keys")
    .values({
      organization_id: organizationId,
      name,
      key_hash: generated.keyHash,
      key_prefix: generated.keyPrefix,
      is_active: true,
      created_by: createdBy
    })
    .returningAll()
    .executeTakeFirstOrThrow();

  return {
    apiKey: row as unknown as APIKeyRecord,
    rawApiKey: generated.rawApiKey
  };
};

export const archiveApiKey = async (
  organizationId: number,
  apiKeyId: number
): Promise<boolean> => {
  const result = await db
    .updateTable("api_keys")
    .set({
      is_active: false,
      archived_at: new Date()
    })
    .where("id", "=", apiKeyId)
    .where("organization_id", "=", organizationId)
    .executeTakeFirst();
  return Number(result.numUpdatedRows) > 0;
};

export const reactivateApiKey = async (
  organizationId: number,
  apiKeyId: number
): Promise<boolean> => {
  const result = await db
    .updateTable("api_keys")
    .set({
      is_active: true,
      archived_at: null
    })
    .where("id", "=", apiKeyId)
    .where("organization_id", "=", organizationId)
    .executeTakeFirst();
  return Number(result.numUpdatedRows) > 0;
};
