import type { RequestHandler, Router } from "express";
import { z } from "zod";
import { HttpError } from "../errors/httpError.js";
import { requireSuperuser, requireUser } from "../middleware/auth.js";
import { getUserById } from "../db/repositories/users.js";
import { impersonateStackUser } from "../services/auth/stackAuth.js";
import { getWorkflowRunsForSuperadmin } from "../db/repositories/workflowRuns.js";

const impersonateSchema = z.object({
  provider_user_id: z.string().nullable().optional(),
  user_id: z.number().int().nullable().optional()
});

const impersonate: RequestHandler = async (req, res, next) => {
  try {
    const body = impersonateSchema.parse(req.body);
    let providerUserId = body.provider_user_id ?? null;

    if (!providerUserId) {
      if (!body.user_id) {
        throw new HttpError(
          400,
          "Either 'provider_user_id' or 'user_id' must be provided."
        );
      }
      const user = await getUserById(body.user_id);
      if (!user) {
        throw new HttpError(404, `User with ID ${body.user_id} not found.`);
      }
      providerUserId = user.provider_id;
    }

    res.json(await impersonateStackUser(providerUserId));
  } catch (err) {
    next(err);
  }
};

const workflowRuns: RequestHandler = async (req, res, next) => {
  try {
    const page = Math.max(Number(req.query.page ?? 1), 1);
    const limit = Math.min(Math.max(Number(req.query.limit ?? 50), 1), 100);
    const offset = (page - 1) * limit;
    let filters = null;

    if (typeof req.query.filters === "string") {
      try {
        filters = JSON.parse(req.query.filters) as Array<Record<string, unknown>>;
      } catch {
        throw new HttpError(400, "Invalid filter format");
      }
    }

    const sortOrder = req.query.sort_order === "asc" ? "asc" : "desc";
    const sortBy =
      typeof req.query.sort_by === "string" ? req.query.sort_by : null;

    const result = await getWorkflowRunsForSuperadmin({
      limit,
      offset,
      filters,
      sortBy,
      sortOrder
    });

    res.json({
      workflow_runs: result.workflowRuns,
      total_count: result.totalCount,
      page,
      limit,
      total_pages: Math.ceil(result.totalCount / limit)
    });
  } catch (err) {
    next(err);
  }
};

export const registerSuperuserRoutes = (router: Router): void => {
  router.post("/superuser/impersonate", requireUser, requireSuperuser, impersonate);
  router.get(
    "/superuser/workflow-runs",
    requireUser,
    requireSuperuser,
    workflowRuns
  );
};
