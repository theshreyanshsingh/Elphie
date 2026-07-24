import type { NextFunction, Request, Response } from "express";
import { HttpError } from "../errors/httpError.js";
import { env } from "../config/env.js";
import { validateApiKey } from "../db/repositories/apiKeys.js";
import {
  getOrCreateUserByProviderId,
  getUserById,
  updateUserEmail,
  updateUserSelectedOrganization
} from "../db/repositories/users.js";
import {
  addUserToOrganization,
  getOrCreateOrganizationByProviderId
} from "../db/repositories/organizations.js";
import { getStackUser } from "../services/auth/stackAuth.js";
import { decodeJwtToken } from "../services/auth/token.js";

export type AuthenticatedUser = {
  id: number;
  providerId: string;
  selectedOrganizationId: number | null;
  isSuperuser: boolean;
  email: string | null;
};

declare module "express-serve-static-core" {
  interface Request {
    user?: AuthenticatedUser;
  }
}

const bearerToken = (authorization: string | undefined): string | null => {
  if (!authorization) {
    return null;
  }
  return authorization.startsWith("Bearer ")
    ? authorization.slice("Bearer ".length)
    : authorization;
};

export const requireUser = (
  req: Request,
  _res: Response,
  next: NextFunction
): void => {
  const apiKey = req.header("x-api-key");
  if (apiKey) {
    validateApiKey(apiKey)
      .then(async (apiKeyModel) => {
        if (!apiKeyModel) {
          next(new HttpError(401, "Invalid or expired API key"));
          return;
        }
        if (!apiKeyModel.created_by) {
          next(new HttpError(401, "API key has no associated user"));
          return;
        }
        const user = await getUserById(apiKeyModel.created_by);
        if (!user) {
          next(new HttpError(401, "API key owner not found"));
          return;
        }
        req.user = {
          id: user.id,
          providerId: user.provider_id,
          selectedOrganizationId: apiKeyModel.organization_id,
          isSuperuser: user.is_superuser,
          email: user.email
        };
        next();
      })
      .catch(() => next(new HttpError(401, "Invalid or expired API key")));
    return;
  }

  if (env.authProvider !== "local") {
    handleStackAuth(req)
      .then(() => next())
      .catch((err) => next(err));
    return;
  }

  const token = bearerToken(req.header("authorization"));
  if (!token) {
    next(new HttpError(401, "Authorization header required"));
    return;
  }

  try {
    const payload = decodeJwtToken(token);
    const userId = Number(payload.sub);
    if (!Number.isInteger(userId)) {
      next(new HttpError(401, "Invalid authorization token"));
      return;
    }

    getUserById(userId)
      .then((user) => {
        if (!user) {
          next(new HttpError(401, "User not found"));
          return;
        }
        req.user = {
          id: user.id,
          providerId: user.provider_id,
          selectedOrganizationId: user.selected_organization_id,
          isSuperuser: user.is_superuser,
          email: user.email
        };
        next();
      })
      .catch(() => next(new HttpError(401, "Invalid or expired token")));
  } catch {
    next(new HttpError(401, "Invalid or expired token"));
  }
};

const handleStackAuth = async (req: Request): Promise<void> => {
  const stackUser = await getStackUser(req.header("authorization"));
  if (!stackUser) {
    throw new HttpError(401, "Unauthorized");
  }

  const selectedTeamId =
    stackUser.selected_team_id ?? stackUser.selected_team?.id ?? null;
  if (!selectedTeamId) {
    throw new HttpError(400, "No team selected");
  }

  const { user } = await getOrCreateUserByProviderId(stackUser.id);
  const stackEmail =
    stackUser.primary_email_verified && stackUser.primary_email
      ? stackUser.primary_email
      : null;
  if (stackEmail && user.email !== stackEmail) {
    await updateUserEmail(user.id, stackEmail);
    user.email = stackEmail.toLowerCase();
  }

  const { organization } =
    await getOrCreateOrganizationByProviderId(selectedTeamId);
  await addUserToOrganization(user.id, organization.id);
  if (user.selected_organization_id !== organization.id) {
    await updateUserSelectedOrganization(user.id, organization.id);
  }

  req.user = {
    id: user.id,
    providerId: user.provider_id,
    selectedOrganizationId: organization.id,
    isSuperuser: user.is_superuser,
    email: user.email
  };
};

export const attachSyntheticUserForTests = (
  userId: number,
  email: string | null = null
): AuthenticatedUser => ({
  id: userId,
  providerId: String(userId),
  selectedOrganizationId: null,
  isSuperuser: false,
  email
});

export const requireSelectedOrganization = (
  req: Request,
  _res: Response,
  next: NextFunction
): void => {
  if (!req.user?.selectedOrganizationId) {
    next(new HttpError(400, "No organization selected"));
    return;
  }
  next();
};

export const requireSuperuser = (
  req: Request,
  _res: Response,
  next: NextFunction
): void => {
  if (!req.user?.isSuperuser) {
    next(new HttpError(403, "Access denied. Superuser privileges required."));
    return;
  }
  next();
};
