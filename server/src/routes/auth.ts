import type { RequestHandler, Router } from "express";
import { z } from "zod";
import { HttpError } from "../errors/httpError.js";
import { requireUser } from "../middleware/auth.js";
import {
  addUserToOrganization,
  getOrCreateOrganizationByProviderId
} from "../db/repositories/organizations.js";
import {
  createUserWithEmail,
  getUserByEmail,
  updateUserSelectedOrganization
} from "../db/repositories/users.js";
import { hashPassword, verifyPassword } from "../services/auth/password.js";
import { createJwtToken } from "../services/auth/token.js";

const signupSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8, "Password must be at least 8 characters"),
  name: z.string().nullable().optional()
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string()
});

const userResponse = (
  user: {
    id: number;
    email: string | null;
    provider_id: string;
    selected_organization_id: number | null;
  },
  name?: string | null,
  organizationId = user.selected_organization_id
) => ({
  id: user.id,
  email: user.email,
  name: name ?? null,
  organization_id: organizationId,
  provider_id: user.provider_id
});

const signup: RequestHandler = async (req, res, next) => {
  try {
    const body = signupSchema.parse(req.body);
    const existing = await getUserByEmail(body.email);
    if (existing) {
      throw new HttpError(409, "Email already registered");
    }

    const passwordHash = await hashPassword(body.password);
    const user = await createUserWithEmail(body.email, passwordHash);
    const orgProviderId = `org_${user.provider_id}`;
    const { organization } = await getOrCreateOrganizationByProviderId(orgProviderId);
    await addUserToOrganization(user.id, organization.id);
    await updateUserSelectedOrganization(user.id, organization.id);

    const token = createJwtToken(user.id, user.email);
    res.json({
      token,
      user: userResponse(user, body.name ?? null, organization.id)
    });
  } catch (err) {
    next(err);
  }
};

const login: RequestHandler = async (req, res, next) => {
  try {
    const body = loginSchema.parse(req.body);
    const user = await getUserByEmail(body.email);
    if (!user?.password_hash) {
      throw new HttpError(401, "Invalid email or password");
    }

    const ok = await verifyPassword(body.password, user.password_hash);
    if (!ok) {
      throw new HttpError(401, "Invalid email or password");
    }

    const token = createJwtToken(user.id, user.email);
    res.json({
      token,
      user: userResponse(user)
    });
  } catch (err) {
    next(err);
  }
};

const me: RequestHandler = (req, res) => {
  const user = req.user;
  if (!user) {
    throw new HttpError(401, "Unauthorized");
  }
  res.json({
    id: user.id,
    email: user.email,
    name: null,
    organization_id: user.selectedOrganizationId,
    provider_id: user.providerId
  });
};

export const registerAuthRoutes = (router: Router): void => {
  router.post("/auth/signup", signup);
  router.post("/auth/login", login);
  router.get("/auth/me", requireUser, me);
};
