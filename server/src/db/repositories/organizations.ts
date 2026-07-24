import { db } from "../database.js";

export type OrganizationRecord = {
  id: number;
  provider_id: string;
  quota_type: string;
  quota_dograh_tokens: number;
  quota_reset_day: number;
  quota_start_date: Date | string | null;
  quota_enabled: boolean;
  price_per_second_usd: number | null;
  created_at: Date | string;
};

export const getOrganizationByProviderId = async (
  providerId: string
): Promise<OrganizationRecord | null> => {
  const row = await db
    .selectFrom("organizations")
    .selectAll()
    .where("provider_id", "=", providerId)
    .executeTakeFirst();
  return (row as OrganizationRecord | undefined) ?? null;
};

export const getOrganizationById = async (
  organizationId: number
): Promise<OrganizationRecord | null> => {
  const row = await db
    .selectFrom("organizations")
    .selectAll()
    .where("id", "=", organizationId)
    .executeTakeFirst();
  return (row as OrganizationRecord | undefined) ?? null;
};

export const getOrCreateOrganizationByProviderId = async (
  providerId: string
): Promise<{ organization: OrganizationRecord; wasCreated: boolean }> => {
  const existing = await getOrganizationByProviderId(providerId);
  if (existing) {
    return { organization: existing, wasCreated: false };
  }

  const inserted = await db
    .insertInto("organizations")
    .values({
      provider_id: providerId,
      quota_type: "monthly",
      quota_dograh_tokens: 0,
      quota_reset_day: 1,
      quota_enabled: false
    })
    .onConflict((oc) => oc.column("provider_id").doNothing())
    .returningAll()
    .executeTakeFirst();

  if (inserted) {
    return {
      organization: inserted as unknown as OrganizationRecord,
      wasCreated: true
    };
  }

  const organization = await getOrganizationByProviderId(providerId);
  if (!organization) {
    throw new Error(`Failed to fetch organization ${providerId}`);
  }
  return { organization, wasCreated: false };
};

export const addUserToOrganization = async (
  userId: number,
  organizationId: number
): Promise<void> => {
  await db
    .insertInto("organization_users")
    .values({
      user_id: userId,
      organization_id: organizationId
    })
    .onConflict((oc) => oc.columns(["user_id", "organization_id"]).doNothing())
    .executeTakeFirst();
};
