import { randomUUID } from "node:crypto";
import { sql } from "kysely";
import { db } from "../database.js";
import type {
  JsonValue,
  WorkflowDefinitionTable,
  WorkflowTable,
  WorkflowTemplateTable
} from "../types.js";

export type WorkflowDefinitionRecord = Omit<
  WorkflowDefinitionTable,
  "id" | "created_at" | "published_at"
> & {
  id: number;
  created_at: Date | string;
  published_at: Date | string | null;
};

export type WorkflowRecord = Omit<
  WorkflowTable,
  "id" | "created_at"
> & {
  id: number;
  created_at: Date | string;
};

export type WorkflowTemplateRecord = Omit<WorkflowTemplateTable, "id" | "created_at"> & {
  id: number;
  created_at: Date | string;
};

export type WorkflowListRecord = Pick<
  WorkflowRecord,
  "id" | "name" | "status" | "created_at" | "folder_id" | "workflow_uuid"
> & {
  total_runs: number;
};

export const getWorkflowByIdForOrg = async (
  workflowId: number,
  organizationId: number
): Promise<WorkflowRecord | null> => {
  const row = await db
    .selectFrom("workflows")
    .selectAll()
    .where("id", "=", workflowId)
    .where("organization_id", "=", organizationId)
    .executeTakeFirst();
  return (row as unknown as WorkflowRecord | undefined) ?? null;
};

export const getWorkflowById = async (
  workflowId: number
): Promise<WorkflowRecord | null> => {
  const row = await db
    .selectFrom("workflows")
    .selectAll()
    .where("id", "=", workflowId)
    .executeTakeFirst();
  return (row as unknown as WorkflowRecord | undefined) ?? null;
};

export const getWorkflowByUuidForOrg = async (
  workflowUuid: string,
  organizationId: number
): Promise<WorkflowRecord | null> => {
  const row = await db
    .selectFrom("workflows")
    .selectAll()
    .where("workflow_uuid", "=", workflowUuid)
    .where("organization_id", "=", organizationId)
    .executeTakeFirst();
  return (row as unknown as WorkflowRecord | undefined) ?? null;
};

export const getWorkflowDefinitionForExecution = async (
  workflow: WorkflowRecord,
  options: { useDraft: boolean }
): Promise<WorkflowDefinitionRecord | null> => {
  if (options.useDraft) {
    const draft = await db
      .selectFrom("workflow_definitions")
      .selectAll()
      .where("workflow_id", "=", workflow.id)
      .where("status", "=", "draft")
      .executeTakeFirst();
    if (draft) {
      return draft as unknown as WorkflowDefinitionRecord;
    }
  }

  if (workflow.released_definition_id) {
    const released = await db
      .selectFrom("workflow_definitions")
      .selectAll()
      .where("id", "=", workflow.released_definition_id)
      .executeTakeFirst();
    if (released) {
      return released as unknown as WorkflowDefinitionRecord;
    }
  }

  const current = await db
    .selectFrom("workflow_definitions")
    .selectAll()
    .where("workflow_id", "=", workflow.id)
    .where("is_current", "=", true)
    .executeTakeFirst();
  return (current as unknown as WorkflowDefinitionRecord | undefined) ?? null;
};

export const objectOrEmpty = (value: JsonValue | null | undefined): Record<string, unknown> =>
  value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};

export const getCurrentWorkflowDefinition = async (
  workflow: WorkflowRecord
): Promise<WorkflowDefinitionRecord | null> => {
  if (workflow.released_definition_id) {
    const released = await db
      .selectFrom("workflow_definitions")
      .selectAll()
      .where("id", "=", workflow.released_definition_id)
      .executeTakeFirst();
    if (released) return released as unknown as WorkflowDefinitionRecord;
  }

  const current = await db
    .selectFrom("workflow_definitions")
    .selectAll()
    .where("workflow_id", "=", workflow.id)
    .where("is_current", "=", true)
    .executeTakeFirst();
  return (current as unknown as WorkflowDefinitionRecord | undefined) ?? null;
};

export const getDraftWorkflowDefinition = async (
  workflowId: number
): Promise<WorkflowDefinitionRecord | null> => {
  const row = await db
    .selectFrom("workflow_definitions")
    .selectAll()
    .where("workflow_id", "=", workflowId)
    .where("status", "=", "draft")
    .executeTakeFirst();
  return (row as unknown as WorkflowDefinitionRecord | undefined) ?? null;
};

const nextVersionNumber = async (
  workflowId: number,
  executor: typeof db = db
): Promise<number> => {
  const row = await executor
    .selectFrom("workflow_definitions")
    .select(sql<number>`COALESCE(max(version_number), 0)`.as("max_version"))
    .where("workflow_id", "=", workflowId)
    .executeTakeFirst();
  return Number(row?.max_version ?? 0) + 1;
};

export const createWorkflow = async (input: {
  name: string;
  workflowDefinition: Record<string, unknown>;
  userId: number;
  organizationId: number;
}): Promise<WorkflowRecord> =>
  await db.transaction().execute(async (trx) => {
    const workflow = await trx
      .insertInto("workflows")
      .values({
        workflow_uuid: randomUUID(),
        user_id: input.userId,
        organization_id: input.organizationId,
        name: input.name,
        status: "active",
        workflow_definition: input.workflowDefinition,
        workflow_configurations: {},
        template_context_variables: {},
        call_disposition_codes: {},
        folder_id: null,
        released_definition_id: null
      })
      .returningAll()
      .executeTakeFirstOrThrow();

    const definition = await trx
      .insertInto("workflow_definitions")
      .values({
        workflow_hash: null,
        workflow_json: input.workflowDefinition,
        workflow_id: workflow.id,
        is_current: true,
        status: "published",
        version_number: 1,
        published_at: new Date(),
        workflow_configurations: {},
        template_context_variables: {}
      })
      .returningAll()
      .executeTakeFirstOrThrow();

    const updated = await trx
      .updateTable("workflows")
      .set({ released_definition_id: definition.id })
      .where("id", "=", workflow.id)
      .returningAll()
      .executeTakeFirstOrThrow();

    return updated as unknown as WorkflowRecord;
  });

export const saveWorkflowDraft = async (input: {
  workflowId: number;
  workflowDefinition?: Record<string, unknown> | null;
  workflowConfigurations?: Record<string, unknown> | null;
  templateContextVariables?: Record<string, unknown> | null;
}): Promise<WorkflowDefinitionRecord> =>
  await db.transaction().execute(async (trx) => {
    const existingDraft = await trx
      .selectFrom("workflow_definitions")
      .selectAll()
      .where("workflow_id", "=", input.workflowId)
      .where("status", "=", "draft")
      .executeTakeFirst();

    if (existingDraft) {
      const patch: Record<string, unknown> = {};
      if (input.workflowDefinition !== undefined) {
        patch.workflow_json = input.workflowDefinition ?? {};
      }
      if (input.workflowConfigurations !== undefined) {
        patch.workflow_configurations = input.workflowConfigurations ?? {};
      }
      if (input.templateContextVariables !== undefined) {
        patch.template_context_variables = input.templateContextVariables ?? {};
      }
      const draft = Object.keys(patch).length
        ? await trx
            .updateTable("workflow_definitions")
            .set(patch)
            .where("id", "=", existingDraft.id)
            .returningAll()
            .executeTakeFirstOrThrow()
        : existingDraft;

      await trx
        .updateTable("workflows")
        .set({
          workflow_definition: draft.workflow_json,
          workflow_configurations: draft.workflow_configurations,
          template_context_variables: draft.template_context_variables
        })
        .where("id", "=", input.workflowId)
        .executeTakeFirst();

      return draft as unknown as WorkflowDefinitionRecord;
    }

    const published = await trx
      .selectFrom("workflow_definitions")
      .selectAll()
      .where("workflow_id", "=", input.workflowId)
      .where("status", "=", "published")
      .orderBy("version_number", "desc")
      .executeTakeFirst();
    const versionNumber = await nextVersionNumber(input.workflowId, trx as typeof db);
    const draft = await trx
      .insertInto("workflow_definitions")
      .values({
        workflow_hash: null,
        workflow_json: input.workflowDefinition ?? published?.workflow_json ?? {},
        workflow_id: input.workflowId,
        is_current: false,
        status: "draft",
        version_number: versionNumber,
        published_at: null,
        workflow_configurations:
          input.workflowConfigurations ?? published?.workflow_configurations ?? {},
        template_context_variables:
          input.templateContextVariables ?? published?.template_context_variables ?? {}
      })
      .returningAll()
      .executeTakeFirstOrThrow();

    await trx
      .updateTable("workflows")
      .set({
        workflow_definition: draft.workflow_json,
        workflow_configurations: draft.workflow_configurations,
        template_context_variables: draft.template_context_variables
      })
      .where("id", "=", input.workflowId)
      .executeTakeFirst();

    return draft as unknown as WorkflowDefinitionRecord;
  });

export const publishWorkflowDraft = async (
  workflowId: number
): Promise<WorkflowDefinitionRecord | null> =>
  await db.transaction().execute(async (trx) => {
    const draft = await trx
      .selectFrom("workflow_definitions")
      .selectAll()
      .where("workflow_id", "=", workflowId)
      .where("status", "=", "draft")
      .executeTakeFirst();
    if (!draft) return null;

    await trx
      .updateTable("workflow_definitions")
      .set({ status: "archived", is_current: false })
      .where("workflow_id", "=", workflowId)
      .where("status", "=", "published")
      .execute();

    const published = await trx
      .updateTable("workflow_definitions")
      .set({ status: "published", is_current: true, published_at: new Date() })
      .where("id", "=", draft.id)
      .returningAll()
      .executeTakeFirstOrThrow();

    await trx
      .updateTable("workflows")
      .set({
        released_definition_id: published.id,
        workflow_definition: published.workflow_json,
        workflow_configurations: published.workflow_configurations,
        template_context_variables: published.template_context_variables
      })
      .where("id", "=", workflowId)
      .executeTakeFirst();

    return published as unknown as WorkflowDefinitionRecord;
  });

export const listWorkflowVersions = async (input: {
  workflowId: number;
  limit?: number | null;
  offset?: number;
}): Promise<WorkflowDefinitionRecord[]> => {
  let query = db
    .selectFrom("workflow_definitions")
    .selectAll()
    .where("workflow_id", "=", input.workflowId)
    .where("status", "in", ["published", "draft", "archived"])
    .orderBy("version_number", "desc");
  if (input.offset) query = query.offset(input.offset);
  if (input.limit) query = query.limit(input.limit);
  const rows = await query.execute();
  return rows as unknown as WorkflowDefinitionRecord[];
};

const statusValues = (status: string | null | undefined): string[] => {
  if (!status) return [];
  return status
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
};

export const listWorkflowsForOrg = async (
  organizationId: number,
  status?: string | null
): Promise<WorkflowListRecord[]> => {
  let query = db
    .selectFrom("workflows as w")
    .leftJoin("workflow_runs as wr", "wr.workflow_id", "w.id")
    .select([
      "w.id as id",
      "w.name as name",
      "w.status as status",
      "w.created_at as created_at",
      "w.folder_id as folder_id",
      "w.workflow_uuid as workflow_uuid",
      sql<number>`count(wr.id)`.as("total_runs")
    ])
    .where("w.organization_id", "=", organizationId)
    .groupBy([
      "w.id",
      "w.name",
      "w.status",
      "w.created_at",
      "w.folder_id",
      "w.workflow_uuid"
    ])
    .orderBy("w.created_at", "desc");
  const statuses = statusValues(status);
  if (statuses.length === 1) query = query.where("w.status", "=", statuses[0]);
  if (statuses.length > 1) query = query.where("w.status", "in", statuses);
  const rows = await query.execute();
  return rows.map((row) => ({
    ...row,
    total_runs: Number(row.total_runs)
  })) as WorkflowListRecord[];
};

export const countWorkflowsForOrg = async (
  organizationId: number
): Promise<{ total: number; active: number; archived: number }> => {
  const rows = await db
    .selectFrom("workflows")
    .select(["status", sql<number>`count(id)`.as("count")])
    .where("organization_id", "=", organizationId)
    .groupBy("status")
    .execute();
  const counts = { total: 0, active: 0, archived: 0 };
  for (const row of rows) {
    const count = Number(row.count ?? 0);
    counts.total += count;
    if (row.status === "active") counts.active = count;
    if (row.status === "archived") counts.archived = count;
  }
  return counts;
};

export const countWorkflowRuns = async (workflowId: number): Promise<number> => {
  const row = await db
    .selectFrom("workflow_runs")
    .select(sql<number>`count(id)`.as("count"))
    .where("workflow_id", "=", workflowId)
    .executeTakeFirst();
  return Number(row?.count ?? 0);
};

export const updateWorkflow = async (input: {
  workflowId: number;
  organizationId: number;
  name?: string | null;
  workflowDefinition?: Record<string, unknown> | null;
  workflowConfigurations?: Record<string, unknown> | null;
  templateContextVariables?: Record<string, unknown> | null;
}): Promise<WorkflowRecord | null> => {
  const existing = await getWorkflowByIdForOrg(input.workflowId, input.organizationId);
  if (!existing) return null;

  if (input.name !== undefined && input.name !== null) {
    await db
      .updateTable("workflows")
      .set({ name: input.name })
      .where("id", "=", input.workflowId)
      .where("organization_id", "=", input.organizationId)
      .executeTakeFirst();
  }

  if (
    input.workflowDefinition !== undefined ||
    input.workflowConfigurations !== undefined ||
    input.templateContextVariables !== undefined
  ) {
    await saveWorkflowDraft({
      workflowId: input.workflowId,
      workflowDefinition: input.workflowDefinition,
      workflowConfigurations: input.workflowConfigurations,
      templateContextVariables: input.templateContextVariables
    });
  }

  return await getWorkflowByIdForOrg(input.workflowId, input.organizationId);
};

export const updateWorkflowStatus = async (input: {
  workflowId: number;
  organizationId: number;
  status: string;
}): Promise<WorkflowRecord | null> => {
  const row = await db
    .updateTable("workflows")
    .set({ status: input.status })
    .where("id", "=", input.workflowId)
    .where("organization_id", "=", input.organizationId)
    .returningAll()
    .executeTakeFirst();
  return (row as unknown as WorkflowRecord | undefined) ?? null;
};

export const moveWorkflowToFolder = async (input: {
  workflowId: number;
  organizationId: number;
  folderId: number | null;
}): Promise<WorkflowRecord | null> => {
  if (input.folderId !== null) {
    const folder = await db
      .selectFrom("folders")
      .select("id")
      .where("id", "=", input.folderId)
      .where("organization_id", "=", input.organizationId)
      .executeTakeFirst();
    if (!folder) return null;
  }
  const row = await db
    .updateTable("workflows")
    .set({ folder_id: input.folderId })
    .where("id", "=", input.workflowId)
    .where("organization_id", "=", input.organizationId)
    .returningAll()
    .executeTakeFirst();
  return (row as unknown as WorkflowRecord | undefined) ?? null;
};

export const duplicateWorkflow = async (input: {
  workflowId: number;
  organizationId: number;
  userId: number;
}): Promise<WorkflowRecord | null> => {
  const workflow = await getWorkflowByIdForOrg(input.workflowId, input.organizationId);
  if (!workflow) return null;
  const activeDefinition =
    (await getDraftWorkflowDefinition(workflow.id)) ??
    (await getCurrentWorkflowDefinition(workflow));
  return await createWorkflow({
    name: `${workflow.name} Copy`,
    workflowDefinition: objectOrEmpty(activeDefinition?.workflow_json ?? workflow.workflow_definition),
    userId: input.userId,
    organizationId: input.organizationId
  });
};

export const listWorkflowTemplates = async (): Promise<WorkflowTemplateRecord[]> => {
  const rows = await db
    .selectFrom("workflow_templates")
    .selectAll()
    .orderBy("template_name", "asc")
    .execute();
  return rows as unknown as WorkflowTemplateRecord[];
};

export const getWorkflowTemplate = async (
  templateId: number
): Promise<WorkflowTemplateRecord | null> => {
  const row = await db
    .selectFrom("workflow_templates")
    .selectAll()
    .where("id", "=", templateId)
    .executeTakeFirst();
  return (row as unknown as WorkflowTemplateRecord | undefined) ?? null;
};
