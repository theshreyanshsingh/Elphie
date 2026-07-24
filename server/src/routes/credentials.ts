import type { RequestHandler, Router } from "express";
import { z } from "zod";
import { HttpError } from "../errors/httpError.js";
import { requireSelectedOrganization, requireUser } from "../middleware/auth.js";
import {
  createCredential,
  CredentialNameConflictError,
  deleteCredential,
  getCredential,
  listCredentials,
  updateCredential
} from "../db/repositories/credentials.js";

const credentialTypes = [
  "none",
  "api_key",
  "bearer_token",
  "basic_auth",
  "custom_header"
] as const;

const createSchema = z.object({
  name: z.string(),
  description: z.string().nullable().optional(),
  credential_type: z.enum(credentialTypes),
  credential_data: z.record(z.unknown()).default({})
});

const updateSchema = z.object({
  name: z.string().optional(),
  description: z.string().nullable().optional(),
  credential_type: z.enum(credentialTypes).optional(),
  credential_data: z.record(z.unknown()).optional()
});

export const validateCredentialData = (
  credentialType: (typeof credentialTypes)[number],
  credentialData: Record<string, unknown>
): void => {
  if (credentialType === "none") return;
  if (
    credentialType === "api_key" &&
    (!credentialData.header_name || !credentialData.api_key)
  ) {
    throw new HttpError(
      400,
      "API Key credential requires 'header_name' and 'api_key' fields"
    );
  }
  if (credentialType === "bearer_token" && !credentialData.token) {
    throw new HttpError(400, "Bearer Token credential requires 'token' field");
  }
  if (
    credentialType === "basic_auth" &&
    (!credentialData.username || !credentialData.password)
  ) {
    throw new HttpError(
      400,
      "Basic Auth credential requires 'username' and 'password' fields"
    );
  }
  if (
    credentialType === "custom_header" &&
    (!credentialData.header_name || !credentialData.header_value)
  ) {
    throw new HttpError(
      400,
      "Custom Header credential requires 'header_name' and 'header_value' fields"
    );
  }
};

const credentialResponse = (credential: {
  credential_uuid: string;
  name: string;
  description: string | null;
  credential_type: string;
  created_at: Date | string;
  updated_at: Date | string | null;
}) => ({
  uuid: credential.credential_uuid,
  name: credential.name,
  description: credential.description,
  credential_type: credential.credential_type,
  created_at: credential.created_at,
  updated_at: credential.updated_at
});

const organizationId = (req: Parameters<RequestHandler>[0]): number => {
  const id = req.user?.selectedOrganizationId;
  if (!id) throw new HttpError(400, "No organization selected for the user");
  return id;
};

const list: RequestHandler = async (req, res, next) => {
  try {
    const credentials = await listCredentials(organizationId(req));
    res.json(credentials.map(credentialResponse));
  } catch (err) {
    next(err);
  }
};

const create: RequestHandler = async (req, res, next) => {
  try {
    if (!req.user) throw new HttpError(401, "Unauthorized");
    const body = createSchema.parse(req.body);
    validateCredentialData(body.credential_type, body.credential_data);
    const credential = await createCredential(organizationId(req), req.user.id, {
      name: body.name,
      description: body.description,
      credentialType: body.credential_type,
      credentialData: body.credential_data
    });
    res.json(credentialResponse(credential));
  } catch (err) {
    if (err instanceof CredentialNameConflictError) {
      next(new HttpError(409, err.message));
      return;
    }
    next(err);
  }
};

const getOne: RequestHandler = async (req, res, next) => {
  try {
    const credential = await getCredential(
      organizationId(req),
      String(req.params.credential_uuid)
    );
    if (!credential) throw new HttpError(404, "Credential not found");
    res.json(credentialResponse(credential));
  } catch (err) {
    next(err);
  }
};

const update: RequestHandler = async (req, res, next) => {
  try {
    const body = updateSchema.parse(req.body);
    if (body.credential_type && body.credential_data) {
      validateCredentialData(body.credential_type, body.credential_data);
    }
    const credential = await updateCredential(
      organizationId(req),
      String(req.params.credential_uuid),
      {
        name: body.name,
        description: body.description,
        credentialType: body.credential_type,
        credentialData: body.credential_data
      }
    );
    if (!credential) throw new HttpError(404, "Credential not found");
    res.json(credentialResponse(credential));
  } catch (err) {
    if (err instanceof CredentialNameConflictError) {
      next(new HttpError(409, err.message));
      return;
    }
    next(err);
  }
};

const remove: RequestHandler = async (req, res, next) => {
  try {
    const deleted = await deleteCredential(
      organizationId(req),
      String(req.params.credential_uuid)
    );
    if (!deleted) throw new HttpError(404, "Credential not found");
    res.json({ status: "deleted", uuid: req.params.credential_uuid });
  } catch (err) {
    next(err);
  }
};

export const registerCredentialRoutes = (router: Router): void => {
  router.get("/credentials/", requireUser, requireSelectedOrganization, list);
  router.post("/credentials/", requireUser, requireSelectedOrganization, create);
  router.get(
    "/credentials/:credential_uuid",
    requireUser,
    requireSelectedOrganization,
    getOne
  );
  router.put(
    "/credentials/:credential_uuid",
    requireUser,
    requireSelectedOrganization,
    update
  );
  router.delete(
    "/credentials/:credential_uuid",
    requireUser,
    requireSelectedOrganization,
    remove
  );
};
