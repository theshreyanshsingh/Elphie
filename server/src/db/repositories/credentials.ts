import { randomUUID } from "node:crypto";
import { db } from "../database.js";

export type CredentialRecord = {
  id: number;
  credential_uuid: string;
  organization_id: number;
  name: string;
  description: string | null;
  credential_type: string;
  credential_data: unknown;
  created_by: number;
  created_at: Date | string;
  updated_at: Date | string | null;
  is_active: boolean;
};

export class CredentialNameConflictError extends Error {}

const asCredential = (row: unknown): CredentialRecord => row as CredentialRecord;

const isUniqueViolation = (err: unknown): boolean =>
  typeof err === "object" &&
  err !== null &&
  "code" in err &&
  (err as { code?: string }).code === "23505";

export const listCredentials = async (
  organizationId: number
): Promise<CredentialRecord[]> => {
  const rows = await db
    .selectFrom("external_credentials")
    .selectAll()
    .where("organization_id", "=", organizationId)
    .where("is_active", "=", true)
    .orderBy("name", "asc")
    .execute();
  return rows.map(asCredential);
};

export const createCredential = async (
  organizationId: number,
  userId: number,
  input: {
    name: string;
    description?: string | null;
    credentialType: string;
    credentialData: Record<string, unknown>;
  }
): Promise<CredentialRecord> => {
  try {
    const row = await db
      .insertInto("external_credentials")
      .values({
        credential_uuid: randomUUID(),
        organization_id: organizationId,
        created_by: userId,
        name: input.name,
        description: input.description ?? null,
        credential_type: input.credentialType,
        credential_data: input.credentialData,
        is_active: true
      })
      .returningAll()
      .executeTakeFirstOrThrow();
    return asCredential(row);
  } catch (err) {
    if (isUniqueViolation(err)) {
      throw new CredentialNameConflictError(
        `A credential with the name '${input.name}' already exists`
      );
    }
    throw err;
  }
};

export const getCredential = async (
  organizationId: number,
  credentialUuid: string
): Promise<CredentialRecord | null> => {
  const row = await db
    .selectFrom("external_credentials")
    .selectAll()
    .where("organization_id", "=", organizationId)
    .where("credential_uuid", "=", credentialUuid)
    .where("is_active", "=", true)
    .executeTakeFirst();
  return row ? asCredential(row) : null;
};

export const updateCredential = async (
  organizationId: number,
  credentialUuid: string,
  input: {
    name?: string;
    description?: string | null;
    credentialType?: string;
    credentialData?: Record<string, unknown>;
  }
): Promise<CredentialRecord | null> => {
  const set: Record<string, unknown> = { updated_at: new Date() };
  if (input.name !== undefined) set.name = input.name;
  if (input.description !== undefined) set.description = input.description;
  if (input.credentialType !== undefined) set.credential_type = input.credentialType;
  if (input.credentialData !== undefined) set.credential_data = input.credentialData;

  try {
    const row = await db
      .updateTable("external_credentials")
      .set(set)
      .where("organization_id", "=", organizationId)
      .where("credential_uuid", "=", credentialUuid)
      .where("is_active", "=", true)
      .returningAll()
      .executeTakeFirst();
    return row ? asCredential(row) : null;
  } catch (err) {
    if (isUniqueViolation(err)) {
      throw new CredentialNameConflictError(
        `A credential with the name '${input.name}' already exists`
      );
    }
    throw err;
  }
};

export const deleteCredential = async (
  organizationId: number,
  credentialUuid: string
): Promise<boolean> => {
  const result = await db
    .updateTable("external_credentials")
    .set({ is_active: false, updated_at: new Date() })
    .where("organization_id", "=", organizationId)
    .where("credential_uuid", "=", credentialUuid)
    .where("is_active", "=", true)
    .executeTakeFirst();
  return Number(result.numUpdatedRows) > 0;
};
