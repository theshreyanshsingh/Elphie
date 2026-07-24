import type { RequestHandler, Router } from "express";
import { z } from "zod";
import { HttpError } from "../errors/httpError.js";
import { requireSelectedOrganization, requireUser } from "../middleware/auth.js";
import {
  createFolder,
  deleteFolder,
  FolderNameConflictError,
  listFolders,
  renameFolder
} from "../db/repositories/folders.js";

const folderSchema = z.object({
  name: z
    .string()
    .min(1)
    .max(100)
    .transform((value) => {
      const trimmed = value.trim();
      if (!trimmed) {
        throw new Error("Folder name cannot be empty");
      }
      return trimmed;
    })
});

const folderResponse = (folder: {
  id: number;
  name: string;
  created_at: Date | string;
}) => ({
  id: folder.id,
  name: folder.name,
  created_at: folder.created_at
});

const organizationId = (req: Parameters<RequestHandler>[0]): number => {
  const id = req.user?.selectedOrganizationId;
  if (!id) {
    throw new HttpError(400, "No organization selected");
  }
  return id;
};

const list: RequestHandler = async (req, res, next) => {
  try {
    const folders = await listFolders(organizationId(req));
    res.json(folders.map(folderResponse));
  } catch (err) {
    next(err);
  }
};

const create: RequestHandler = async (req, res, next) => {
  try {
    const body = folderSchema.parse(req.body);
    const folder = await createFolder(organizationId(req), body.name);
    res.json(folderResponse(folder));
  } catch (err) {
    if (err instanceof FolderNameConflictError) {
      next(new HttpError(409, err.message));
      return;
    }
    next(err);
  }
};

const rename: RequestHandler = async (req, res, next) => {
  try {
    const body = folderSchema.parse(req.body);
    const folder = await renameFolder(
      organizationId(req),
      Number(req.params.folder_id),
      body.name
    );
    if (!folder) {
      throw new HttpError(404, `Folder with id ${req.params.folder_id} not found`);
    }
    res.json(folderResponse(folder));
  } catch (err) {
    if (err instanceof FolderNameConflictError) {
      next(new HttpError(409, err.message));
      return;
    }
    next(err);
  }
};

const remove: RequestHandler = async (req, res, next) => {
  try {
    const deleted = await deleteFolder(
      organizationId(req),
      Number(req.params.folder_id)
    );
    if (!deleted) {
      throw new HttpError(404, `Folder with id ${req.params.folder_id} not found`);
    }
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
};

export const registerFolderRoutes = (router: Router): void => {
  router.get("/folder/", requireUser, requireSelectedOrganization, list);
  router.post("/folder/", requireUser, requireSelectedOrganization, create);
  router.put(
    "/folder/:folder_id",
    requireUser,
    requireSelectedOrganization,
    rename
  );
  router.delete(
    "/folder/:folder_id",
    requireUser,
    requireSelectedOrganization,
    remove
  );
};
