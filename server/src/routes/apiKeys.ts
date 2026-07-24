import type { RequestHandler, Router } from "express";
import { z } from "zod";
import { HttpError } from "../errors/httpError.js";
import { requireSelectedOrganization, requireUser } from "../middleware/auth.js";
import {
  archiveApiKey,
  createApiKey,
  listApiKeys,
  reactivateApiKey
} from "../db/repositories/apiKeys.js";

const createSchema = z.object({
  name: z.string()
});

const organizationId = (req: Parameters<RequestHandler>[0]): number => {
  const id = req.user?.selectedOrganizationId;
  if (!id) throw new HttpError(400, "No organization selected");
  return id;
};

const keyResponse = (key: {
  id: number;
  name: string;
  key_prefix: string;
  is_active: boolean;
  created_at: Date | string;
  last_used_at: Date | string | null;
  archived_at: Date | string | null;
}) => ({
  id: key.id,
  name: key.name,
  key_prefix: key.key_prefix,
  is_active: key.is_active,
  created_at: key.created_at,
  last_used_at: key.last_used_at,
  archived_at: key.archived_at
});

const list: RequestHandler = async (req, res, next) => {
  try {
    const includeArchived = req.query.include_archived === "true";
    const keys = await listApiKeys(organizationId(req), includeArchived);
    res.json(keys.map(keyResponse));
  } catch (err) {
    next(err);
  }
};

const create: RequestHandler = async (req, res, next) => {
  try {
    if (!req.user) throw new HttpError(401, "Unauthorized");
    const body = createSchema.parse(req.body);
    const { apiKey, rawApiKey } = await createApiKey(
      organizationId(req),
      body.name,
      req.user.id
    );
    res.json({
      id: apiKey.id,
      name: apiKey.name,
      key_prefix: apiKey.key_prefix,
      api_key: rawApiKey,
      created_at: apiKey.created_at
    });
  } catch (err) {
    next(err);
  }
};

const archive: RequestHandler = async (req, res, next) => {
  try {
    const success = await archiveApiKey(
      organizationId(req),
      Number(req.params.api_key_id)
    );
    if (!success) throw new HttpError(404, "API key not found");
    res.json({ success: true, message: "API key archived successfully" });
  } catch (err) {
    next(err);
  }
};

const reactivate: RequestHandler = async (req, res, next) => {
  try {
    const success = await reactivateApiKey(
      organizationId(req),
      Number(req.params.api_key_id)
    );
    if (!success) throw new HttpError(404, "API key not found");
    res.json({ success: true, message: "API key reactivated successfully" });
  } catch (err) {
    next(err);
  }
};

export const registerApiKeyRoutes = (router: Router): void => {
  router.get("/user/api-keys", requireUser, requireSelectedOrganization, list);
  router.post("/user/api-keys", requireUser, requireSelectedOrganization, create);
  router.delete(
    "/user/api-keys/:api_key_id",
    requireUser,
    requireSelectedOrganization,
    archive
  );
  router.put(
    "/user/api-keys/:api_key_id/reactivate",
    requireUser,
    requireSelectedOrganization,
    reactivate
  );
};
