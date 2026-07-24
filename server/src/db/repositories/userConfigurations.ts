import type { JsonValue } from "../types.js";
import { db } from "../database.js";

export const USER_CONFIGURATION_KEYS = {
  modelConfiguration: "MODEL_CONFIGURATION",
  onboarding: "ONBOARDING"
} as const;

export const ORGANIZATION_CONFIGURATION_KEYS = {
  organizationPreferences: "ORGANIZATION_PREFERENCES",
  modelConfigurationPreferences: "MODEL_CONFIGURATION_PREFERENCES"
} as const;

export type JsonObject = Record<string, JsonValue>;

export type OrganizationPreferences = {
  test_phone_number?: string | null;
  timezone?: string | null;
};

const objectOrNull = (value: JsonValue | null | undefined): JsonObject | null =>
  value && typeof value === "object" && !Array.isArray(value)
    ? (value as JsonObject)
    : null;

export const getUserConfigurationValue = async (
  userId: number,
  key: string
): Promise<JsonObject | null> => {
  const row = await db
    .selectFrom("user_configurations")
    .select("configuration")
    .where("user_id", "=", userId)
    .where("key", "=", key)
    .executeTakeFirst();
  return objectOrNull(row?.configuration);
};

export const upsertUserConfigurationValue = async (
  userId: number,
  key: string,
  configuration: JsonObject
): Promise<JsonObject> => {
  const row = await db
    .insertInto("user_configurations")
    .values({
      user_id: userId,
      key,
      configuration
    })
    .onConflict((oc) =>
      oc.columns(["user_id", "key"]).doUpdateSet({
        configuration
      })
    )
    .returning("configuration")
    .executeTakeFirstOrThrow();
  return objectOrNull(row.configuration) ?? {};
};

export const touchUserConfigurationValidation = async (
  userId: number
): Promise<void> => {
  await db
    .updateTable("user_configurations")
    .set({ last_validated_at: new Date() })
    .where("user_id", "=", userId)
    .where("key", "=", USER_CONFIGURATION_KEYS.modelConfiguration)
    .executeTakeFirst();
};

export const getOrganizationConfigurationValue = async (
  organizationId: number,
  key: string
): Promise<JsonObject | null> => {
  const row = await db
    .selectFrom("organization_configurations")
    .select("value")
    .where("organization_id", "=", organizationId)
    .where("key", "=", key)
    .executeTakeFirst();
  return objectOrNull(row?.value);
};

export const upsertOrganizationConfigurationValue = async (
  organizationId: number,
  key: string,
  value: JsonObject
): Promise<JsonObject> => {
  const row = await db
    .insertInto("organization_configurations")
    .values({
      organization_id: organizationId,
      key,
      value
    })
    .onConflict((oc) =>
      oc.columns(["organization_id", "key"]).doUpdateSet({
        value,
        updated_at: new Date()
      })
    )
    .returning("value")
    .executeTakeFirstOrThrow();
  return objectOrNull(row.value) ?? {};
};

export const getOrganizationPreferences = async (
  organizationId: number | null | undefined
): Promise<OrganizationPreferences> => {
  if (!organizationId) {
    return {};
  }
  const current = await getOrganizationConfigurationValue(
    organizationId,
    ORGANIZATION_CONFIGURATION_KEYS.organizationPreferences
  );
  const legacy =
    current ??
    (await getOrganizationConfigurationValue(
      organizationId,
      ORGANIZATION_CONFIGURATION_KEYS.modelConfigurationPreferences
    ));
  return {
    test_phone_number:
      typeof legacy?.test_phone_number === "string" ? legacy.test_phone_number : null,
    timezone: typeof legacy?.timezone === "string" ? legacy.timezone : null
  };
};

export const upsertOrganizationPreferences = async (
  organizationId: number,
  preferences: OrganizationPreferences
): Promise<OrganizationPreferences> => {
  await upsertOrganizationConfigurationValue(
    organizationId,
    ORGANIZATION_CONFIGURATION_KEYS.organizationPreferences,
    preferences as JsonObject
  );
  return preferences;
};
