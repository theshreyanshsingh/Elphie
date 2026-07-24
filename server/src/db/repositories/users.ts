import { sql } from "kysely";
import { randomUUID } from "node:crypto";
import { db } from "../database.js";

export type UserRecord = {
  id: number;
  provider_id: string;
  selected_organization_id: number | null;
  is_superuser: boolean;
  email: string | null;
  password_hash: string | null;
  created_at: Date | string;
};

export const getUserById = async (userId: number): Promise<UserRecord | null> => {
  const row = await db
    .selectFrom("users")
    .selectAll()
    .where("id", "=", userId)
    .executeTakeFirst();
  return (row as UserRecord | undefined) ?? null;
};

export const getUserByProviderId = async (
  providerId: string
): Promise<UserRecord | null> => {
  const row = await db
    .selectFrom("users")
    .selectAll()
    .where("provider_id", "=", providerId)
    .executeTakeFirst();
  return (row as UserRecord | undefined) ?? null;
};

export const getOrCreateUserByProviderId = async (
  providerId: string
): Promise<{ user: UserRecord; wasCreated: boolean }> => {
  const existing = await getUserByProviderId(providerId);
  if (existing) {
    return { user: existing, wasCreated: false };
  }

  const inserted = await db
    .insertInto("users")
    .values({
      provider_id: providerId,
      selected_organization_id: null,
      is_superuser: false
    })
    .onConflict((oc) => oc.column("provider_id").doNothing())
    .returningAll()
    .executeTakeFirst();

  if (inserted) {
    return { user: inserted as unknown as UserRecord, wasCreated: true };
  }

  const user = await getUserByProviderId(providerId);
  if (!user) {
    throw new Error(`Failed to fetch user ${providerId}`);
  }
  return { user, wasCreated: false };
};

export const getUserByEmail = async (
  email: string
): Promise<UserRecord | null> => {
  const row = await db
    .selectFrom("users")
    .selectAll()
    .where(sql`lower(email)`, "=", email.toLowerCase())
    .executeTakeFirst();
  return (row as UserRecord | undefined) ?? null;
};

export const createUserWithEmail = async (
  email: string,
  passwordHash: string
): Promise<UserRecord> => {
  const providerId = `oss_${Math.floor(Date.now() / 1000)}_${randomUUID()}`;
  const row = await db
    .insertInto("users")
    .values({
      provider_id: providerId,
      email: email.toLowerCase(),
      password_hash: passwordHash,
      selected_organization_id: null,
      is_superuser: false
    })
    .returningAll()
    .executeTakeFirstOrThrow();
  return row as unknown as UserRecord;
};

export const updateUserSelectedOrganization = async (
  userId: number,
  organizationId: number
): Promise<void> => {
  await db
    .updateTable("users")
    .set({ selected_organization_id: organizationId })
    .where("id", "=", userId)
    .executeTakeFirst();
};

export const updateUserEmail = async (
  userId: number,
  email: string
): Promise<void> => {
  await db
    .updateTable("users")
    .set({ email: email.toLowerCase() })
    .where("id", "=", userId)
    .executeTakeFirst();
};
