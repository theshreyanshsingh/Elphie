import { sql } from "kysely";
import { db } from "../database.js";
import type { JsonValue } from "../types.js";

export type TelephonyConfigurationRecord = {
  id: number;
  organization_id: number;
  name: string;
  provider: string;
  credentials: JsonValue;
  is_default_outbound: boolean;
  created_at: Date | string;
  updated_at: Date | string | null;
};

export type TelephonyPhoneNumberRecord = {
  id: number;
  organization_id: number;
  telephony_configuration_id: number;
  address: string;
  address_normalized: string;
  address_type: string;
  country_code: string | null;
  label: string | null;
  inbound_workflow_id: number | null;
  inbound_workflow_name?: string | null;
  is_active: boolean;
  is_default_caller_id: boolean;
  extra_metadata: JsonValue;
  created_at: Date | string;
  updated_at: Date | string | null;
};

const normalizePhoneAddress = (address: string): string =>
  address.trim().replace(/[\s-]/g, "");

const phoneAddressType = (address: string): string =>
  address.trim().toLowerCase().startsWith("sip:") ? "sip" : "phone";

export const listTelephonyConfigurations = async (
  organizationId: number
): Promise<TelephonyConfigurationRecord[]> => {
  const rows = await db
    .selectFrom("telephony_configurations")
    .selectAll()
    .where("organization_id", "=", organizationId)
    .orderBy("created_at", "asc")
    .execute();
  return rows as unknown as TelephonyConfigurationRecord[];
};

export const getTelephonyConfigurationForOrg = async (
  configId: number,
  organizationId: number
): Promise<TelephonyConfigurationRecord | null> => {
  const row = await db
    .selectFrom("telephony_configurations")
    .selectAll()
    .where("id", "=", configId)
    .where("organization_id", "=", organizationId)
    .executeTakeFirst();
  return (row as unknown as TelephonyConfigurationRecord | undefined) ?? null;
};

export const getDefaultTelephonyConfiguration = async (
  organizationId: number
): Promise<TelephonyConfigurationRecord | null> => {
  const row = await db
    .selectFrom("telephony_configurations")
    .selectAll()
    .where("organization_id", "=", organizationId)
    .where("is_default_outbound", "=", true)
    .executeTakeFirst();
  return (row as unknown as TelephonyConfigurationRecord | undefined) ?? null;
};

export const createTelephonyConfiguration = async (input: {
  organizationId: number;
  name: string;
  provider: string;
  credentials: JsonValue;
  isDefaultOutbound?: boolean;
}): Promise<TelephonyConfigurationRecord> => {
  const row = await db.transaction().execute(async (trx) => {
    if (input.isDefaultOutbound) {
      await trx
        .updateTable("telephony_configurations")
        .set({ is_default_outbound: false, updated_at: new Date() })
        .where("organization_id", "=", input.organizationId)
        .execute();
    }
    return await trx
      .insertInto("telephony_configurations")
      .values({
        organization_id: input.organizationId,
        name: input.name,
        provider: input.provider,
        credentials: input.credentials,
        is_default_outbound: input.isDefaultOutbound ?? false
      })
      .returningAll()
      .executeTakeFirstOrThrow();
  });
  return row as unknown as TelephonyConfigurationRecord;
};

export const updateTelephonyConfiguration = async (input: {
  configId: number;
  organizationId: number;
  name?: string | null;
  credentials?: JsonValue | null;
}): Promise<TelephonyConfigurationRecord | null> => {
  const patch: Record<string, unknown> = { updated_at: new Date() };
  if (input.name != null) patch.name = input.name;
  if (input.credentials != null) patch.credentials = input.credentials;
  const row = await db
    .updateTable("telephony_configurations")
    .set(patch)
    .where("id", "=", input.configId)
    .where("organization_id", "=", input.organizationId)
    .returningAll()
    .executeTakeFirst();
  return (row as unknown as TelephonyConfigurationRecord | undefined) ?? null;
};

export const setDefaultTelephonyConfiguration = async (
  configId: number,
  organizationId: number
): Promise<TelephonyConfigurationRecord | null> =>
  await db.transaction().execute(async (trx) => {
    const existing = await trx
      .selectFrom("telephony_configurations")
      .selectAll()
      .where("id", "=", configId)
      .where("organization_id", "=", organizationId)
      .executeTakeFirst();
    if (!existing) return null;
    await trx
      .updateTable("telephony_configurations")
      .set({ is_default_outbound: false, updated_at: new Date() })
      .where("organization_id", "=", organizationId)
      .execute();
    const row = await trx
      .updateTable("telephony_configurations")
      .set({ is_default_outbound: true, updated_at: new Date() })
      .where("id", "=", configId)
      .where("organization_id", "=", organizationId)
      .returningAll()
      .executeTakeFirst();
    return (row as unknown as TelephonyConfigurationRecord | undefined) ?? null;
  });

export const deleteTelephonyConfiguration = async (
  configId: number,
  organizationId: number
): Promise<boolean> => {
  const result = await db
    .deleteFrom("telephony_configurations")
    .where("id", "=", configId)
    .where("organization_id", "=", organizationId)
    .executeTakeFirst();
  return Number(result.numDeletedRows) > 0;
};

export const listPhoneNumbersForConfig = async (
  configId: number
): Promise<TelephonyPhoneNumberRecord[]> => {
  const rows = await db
    .selectFrom("telephony_phone_numbers as p")
    .leftJoin("workflows as w", "p.inbound_workflow_id", "w.id")
    .select([
      "p.id as id",
      "p.organization_id as organization_id",
      "p.telephony_configuration_id as telephony_configuration_id",
      "p.address as address",
      "p.address_normalized as address_normalized",
      "p.address_type as address_type",
      "p.country_code as country_code",
      "p.label as label",
      "p.inbound_workflow_id as inbound_workflow_id",
      "w.name as inbound_workflow_name",
      "p.is_active as is_active",
      "p.is_default_caller_id as is_default_caller_id",
      "p.extra_metadata as extra_metadata",
      "p.created_at as created_at",
      "p.updated_at as updated_at"
    ])
    .where("p.telephony_configuration_id", "=", configId)
    .orderBy("p.created_at", "asc")
    .execute();
  return rows as unknown as TelephonyPhoneNumberRecord[];
};

export const listActiveNormalizedAddressesForConfig = async (
  configId: number
): Promise<string[]> => {
  const rows = await db
    .selectFrom("telephony_phone_numbers")
    .select("address_normalized")
    .where("telephony_configuration_id", "=", configId)
    .where("is_active", "=", true)
    .execute();
  return rows.map((row) => row.address_normalized);
};

export const getPhoneNumberForConfig = async (
  phoneNumberId: number,
  configId: number
): Promise<TelephonyPhoneNumberRecord | null> => {
  const rows = await listPhoneNumbersForConfig(configId);
  return rows.find((row) => row.id === phoneNumberId) ?? null;
};

export const createPhoneNumber = async (input: {
  organizationId: number;
  configId: number;
  address: string;
  countryCode?: string | null;
  label?: string | null;
  inboundWorkflowId?: number | null;
  isActive?: boolean;
  isDefaultCallerId?: boolean;
  extraMetadata?: JsonValue;
}): Promise<TelephonyPhoneNumberRecord> => {
  const normalized = normalizePhoneAddress(input.address);
  const row = await db.transaction().execute(async (trx) => {
    if (input.isDefaultCallerId) {
      await trx
        .updateTable("telephony_phone_numbers")
        .set({ is_default_caller_id: false, updated_at: new Date() })
        .where("telephony_configuration_id", "=", input.configId)
        .execute();
    }
    return await trx
      .insertInto("telephony_phone_numbers")
      .values({
        organization_id: input.organizationId,
        telephony_configuration_id: input.configId,
        address: input.address,
        address_normalized: normalized,
        address_type: phoneAddressType(input.address),
        country_code: input.countryCode ?? null,
        label: input.label ?? null,
        inbound_workflow_id: input.inboundWorkflowId ?? null,
        is_active: input.isActive ?? true,
        is_default_caller_id: input.isDefaultCallerId ?? false,
        extra_metadata: input.extraMetadata ?? {}
      })
      .returningAll()
      .executeTakeFirstOrThrow();
  });
  return row as unknown as TelephonyPhoneNumberRecord;
};

export const updatePhoneNumber = async (input: {
  phoneNumberId: number;
  configId: number;
  label?: string | null;
  inboundWorkflowId?: number | null;
  clearInboundWorkflow?: boolean;
  isActive?: boolean;
  countryCode?: string | null;
  extraMetadata?: JsonValue | null;
}): Promise<TelephonyPhoneNumberRecord | null> => {
  const patch: Record<string, unknown> = { updated_at: new Date() };
  if (input.label !== undefined) patch.label = input.label;
  if (input.clearInboundWorkflow) patch.inbound_workflow_id = null;
  else if (input.inboundWorkflowId !== undefined) patch.inbound_workflow_id = input.inboundWorkflowId;
  if (input.isActive !== undefined) patch.is_active = input.isActive;
  if (input.countryCode !== undefined) patch.country_code = input.countryCode;
  if (input.extraMetadata !== undefined && input.extraMetadata !== null) {
    patch.extra_metadata = input.extraMetadata;
  }
  const row = await db
    .updateTable("telephony_phone_numbers")
    .set(patch)
    .where("id", "=", input.phoneNumberId)
    .where("telephony_configuration_id", "=", input.configId)
    .returningAll()
    .executeTakeFirst();
  return (row as unknown as TelephonyPhoneNumberRecord | undefined) ?? null;
};

export const setDefaultCallerId = async (
  phoneNumberId: number,
  configId: number
): Promise<TelephonyPhoneNumberRecord | null> =>
  await db.transaction().execute(async (trx) => {
    const existing = await trx
      .selectFrom("telephony_phone_numbers")
      .selectAll()
      .where("id", "=", phoneNumberId)
      .where("telephony_configuration_id", "=", configId)
      .executeTakeFirst();
    if (!existing) return null;
    await trx
      .updateTable("telephony_phone_numbers")
      .set({ is_default_caller_id: false, updated_at: new Date() })
      .where("telephony_configuration_id", "=", configId)
      .execute();
    const row = await trx
      .updateTable("telephony_phone_numbers")
      .set({ is_default_caller_id: true, updated_at: new Date() })
      .where("id", "=", phoneNumberId)
      .where("telephony_configuration_id", "=", configId)
      .returningAll()
      .executeTakeFirst();
    return (row as unknown as TelephonyPhoneNumberRecord | undefined) ?? null;
  });

export const deletePhoneNumber = async (
  phoneNumberId: number,
  configId: number
): Promise<boolean> => {
  const result = await db
    .deleteFrom("telephony_phone_numbers")
    .where("id", "=", phoneNumberId)
    .where("telephony_configuration_id", "=", configId)
    .executeTakeFirst();
  return Number(result.numDeletedRows) > 0;
};

export const countTelnyxConfigsMissingWebhookPublicKey = async (
  organizationId: number
): Promise<number> => {
  const row = await db
    .selectFrom("telephony_configurations")
    .select(({ fn }) => fn.count<number>("id").as("count"))
    .where("organization_id", "=", organizationId)
    .where("provider", "=", "telnyx")
    .where(sql<boolean>`COALESCE(credentials->>'webhook_public_key', '') = ''`)
    .executeTakeFirst();
  return Number(row?.count ?? 0);
};
