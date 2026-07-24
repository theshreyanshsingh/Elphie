import { db } from "../database.js";

export type FolderRecord = {
  id: number;
  organization_id: number;
  name: string;
  created_at: Date | string;
};

const asFolder = (row: unknown): FolderRecord => row as FolderRecord;

export class FolderNameConflictError extends Error {}

const isUniqueViolation = (err: unknown): boolean =>
  typeof err === "object" &&
  err !== null &&
  "code" in err &&
  (err as { code?: string }).code === "23505";

export const listFolders = async (
  organizationId: number
): Promise<FolderRecord[]> => {
  const rows = await db
    .selectFrom("folders")
    .selectAll()
    .where("organization_id", "=", organizationId)
    .orderBy("name", "asc")
    .execute();
  return rows.map(asFolder);
};

export const createFolder = async (
  organizationId: number,
  name: string
): Promise<FolderRecord> => {
  try {
    const row = await db
      .insertInto("folders")
      .values({
        organization_id: organizationId,
        name
      })
      .returningAll()
      .executeTakeFirstOrThrow();
    return asFolder(row);
  } catch (err) {
    if (isUniqueViolation(err)) {
      throw new FolderNameConflictError(`A folder named '${name}' already exists.`);
    }
    throw err;
  }
};

export const renameFolder = async (
  organizationId: number,
  folderId: number,
  name: string
): Promise<FolderRecord | null> => {
  try {
    const row = await db
      .updateTable("folders")
      .set({ name })
      .where("id", "=", folderId)
      .where("organization_id", "=", organizationId)
      .returningAll()
      .executeTakeFirst();
    return row ? asFolder(row) : null;
  } catch (err) {
    if (isUniqueViolation(err)) {
      throw new FolderNameConflictError(`A folder named '${name}' already exists.`);
    }
    throw err;
  }
};

export const deleteFolder = async (
  organizationId: number,
  folderId: number
): Promise<boolean> => {
  const result = await db
    .deleteFrom("folders")
    .where("id", "=", folderId)
    .where("organization_id", "=", organizationId)
    .executeTakeFirst();
  return Number(result.numDeletedRows) > 0;
};
