import type { RequestHandler, Router } from "express";
import { z } from "zod";
import { getOrganizationById } from "../db/repositories/organizations.js";
import {
  getOrganizationPreferences,
  getUserConfigurationValue,
  type JsonObject,
  USER_CONFIGURATION_KEYS,
  upsertOrganizationPreferences,
  upsertUserConfigurationValue
} from "../db/repositories/userConfigurations.js";
import { HttpError } from "../errors/httpError.js";
import { requireUser } from "../middleware/auth.js";
import {
  applyOrganizationPreferences,
  defaultConfigurationSchemas,
  maskUserConfig,
  mergeUserConfigurations,
  type UserConfiguration
} from "../services/configuration/userConfig.js";
import {
  archiveServiceKeyInMps,
  createServiceKeyInMps,
  getServiceKeysFromMps,
  getVoicesFromMps
} from "../services/mps/client.js";
import {
  applyOnboardingUpdate,
  parseOnboardingState
} from "../services/onboarding/state.js";
import { env } from "../config/env.js";

const configurationSchema = z.object({
  llm: z.record(z.unknown()).nullable().optional(),
  tts: z.record(z.unknown()).nullable().optional(),
  stt: z.record(z.unknown()).nullable().optional(),
  embeddings: z.record(z.unknown()).nullable().optional(),
  realtime: z.record(z.unknown()).nullable().optional(),
  is_realtime: z.boolean().nullable().optional(),
  test_phone_number: z.string().nullable().optional(),
  timezone: z.string().nullable().optional(),
  organization_pricing: z.record(z.union([z.string(), z.number(), z.boolean()])).nullable().optional()
});

const onboardingUpdateSchema = z.object({
  completed_at: z.string().datetime().nullable().optional(),
  skipped: z.boolean().nullable().optional(),
  seen_tooltips: z.array(z.string()).nullable().optional(),
  completed_actions: z.array(z.string()).nullable().optional()
});

const validateQuerySchema = z.object({
  validity_ttl_seconds: z.coerce.number().int().min(0).max(86_400).default(60)
});

const boolQuery = z
  .union([z.boolean(), z.string()])
  .optional()
  .transform((value) => value === true || value === "true");

const serviceKeyQuerySchema = z.object({
  include_archived: boolQuery
});

const createServiceKeySchema = z.object({
  name: z.string().min(1),
  expires_in_days: z.number().int().positive().nullable().optional()
});

const voicesQuerySchema = z.object({
  model: z.string().optional(),
  language: z.string().optional(),
  q: z.string().optional(),
  gender: z.string().optional(),
  accent: z.string().optional()
});

const ttsProviders = new Set([
  "elevenlabs",
  "deepgram",
  "sarvam",
  "cartesia",
  "dograh",
  "rime"
]);

const selectedOrganizationId = (req: Parameters<RequestHandler>[0]): number => {
  const organizationId = req.user?.selectedOrganizationId;
  if (!organizationId) {
    throw new HttpError(400, "No organization selected");
  }
  return organizationId;
};

const serviceKeyScope = (req: Parameters<RequestHandler>[0]) =>
  env.deploymentMode === "oss"
    ? { createdBy: req.user?.providerId ?? null, organizationId: null }
    : {
        createdBy: req.user?.providerId ?? null,
        organizationId: selectedOrganizationId(req)
      };

const configWithOrgData = async (
  config: UserConfiguration,
  organizationId: number | null | undefined
): Promise<UserConfiguration> => {
  let output = maskUserConfig(config);
  if (organizationId) {
    output = applyOrganizationPreferences(
      output,
      await getOrganizationPreferences(organizationId)
    );
    const organization = await getOrganizationById(organizationId);
    if (organization?.price_per_second_usd != null) {
      output.organization_pricing = {
        price_per_second_usd: organization.price_per_second_usd,
        currency: "USD",
        billing_enabled: true
      };
    }
  }
  return output;
};

const getDefaultConfigurations: RequestHandler = (_req, res) => {
  res.json(defaultConfigurationSchemas());
};

const getAuthUser: RequestHandler = (req, res) => {
  if (!req.user) {
    throw new HttpError(401, "Unauthorized");
  }
  res.json({
    id: req.user.id,
    is_superuser: req.user.isSuperuser
  });
};

const getUserConfigurations: RequestHandler = async (req, res, next) => {
  try {
    if (!req.user) throw new HttpError(401, "Unauthorized");
    const config =
      (await getUserConfigurationValue(
        req.user.id,
        USER_CONFIGURATION_KEYS.modelConfiguration
      )) ?? {};
    res.json(await configWithOrgData(config, req.user.selectedOrganizationId));
  } catch (err) {
    next(err);
  }
};

const updateUserConfigurations: RequestHandler = async (req, res, next) => {
  try {
    if (!req.user) throw new HttpError(401, "Unauthorized");
    const incoming = configurationSchema.parse(req.body) as UserConfiguration;
    delete incoming.organization_pricing;

    const preferencesUpdate: Record<string, string | null> = {};
    for (const key of ["test_phone_number", "timezone"] as const) {
      if (Object.prototype.hasOwnProperty.call(incoming, key)) {
        preferencesUpdate[key] = incoming[key] ?? null;
        delete incoming[key];
      }
    }

    const existing =
      (await getUserConfigurationValue(
        req.user.id,
        USER_CONFIGURATION_KEYS.modelConfiguration
      )) ?? {};
    const merged = Object.keys(incoming).length
      ? mergeUserConfigurations(existing, incoming)
      : existing;

    const saved = Object.keys(incoming).length
      ? await upsertUserConfigurationValue(
          req.user.id,
          USER_CONFIGURATION_KEYS.modelConfiguration,
          merged as JsonObject
        )
      : merged;

    if (req.user.selectedOrganizationId && Object.keys(preferencesUpdate).length) {
      const current = await getOrganizationPreferences(req.user.selectedOrganizationId);
      await upsertOrganizationPreferences(req.user.selectedOrganizationId, {
        ...current,
        ...preferencesUpdate
      });
    }

    res.json(await configWithOrgData(saved, req.user.selectedOrganizationId));
  } catch (err) {
    next(err);
  }
};

const getOnboardingState: RequestHandler = async (req, res, next) => {
  try {
    if (!req.user) throw new HttpError(401, "Unauthorized");
    const value = await getUserConfigurationValue(
      req.user.id,
      USER_CONFIGURATION_KEYS.onboarding
    );
    res.json(parseOnboardingState(value));
  } catch (err) {
    next(err);
  }
};

const updateOnboardingState: RequestHandler = async (req, res, next) => {
  try {
    if (!req.user) throw new HttpError(401, "Unauthorized");
    const update = onboardingUpdateSchema.parse(req.body);
    const current = parseOnboardingState(
      await getUserConfigurationValue(req.user.id, USER_CONFIGURATION_KEYS.onboarding)
    );
    const state = applyOnboardingUpdate(current, update);
    await upsertUserConfigurationValue(
      req.user.id,
      USER_CONFIGURATION_KEYS.onboarding,
      state
    );
    res.json(state);
  } catch (err) {
    next(err);
  }
};

const validateUserConfigurations: RequestHandler = (req, res, next) => {
  try {
    validateQuerySchema.parse(req.query);
    res.json({ status: [] });
  } catch (err) {
    next(err);
  }
};

const getVoices: RequestHandler = async (req, res, next) => {
  try {
    if (!req.user) throw new HttpError(401, "Unauthorized");
    const provider = String(req.params.provider);
    if (!ttsProviders.has(provider)) {
      throw new HttpError(422, "Invalid TTS provider");
    }
    const query = voicesQuerySchema.parse(req.query);
    const result = await getVoicesFromMps({
      provider,
      ...query,
      organizationId: req.user.selectedOrganizationId,
      createdBy: req.user.providerId
    });
    res.json({
      provider: result.provider ?? provider,
      voices: Array.isArray(result.voices) ? result.voices : [],
      facets: result.facets ?? null
    });
  } catch (err) {
    next(err);
  }
};

const listServiceKeys: RequestHandler = async (req, res, next) => {
  try {
    if (!req.user) throw new HttpError(401, "Unauthorized");
    const query = serviceKeyQuerySchema.parse(req.query);
    const scope = serviceKeyScope(req);
    const keys = await getServiceKeysFromMps({
      includeArchived: query.include_archived,
      organizationId: scope.organizationId,
      createdBy: scope.createdBy
    });
    res.json(keys);
  } catch (err) {
    next(err);
  }
};

const createServiceKey: RequestHandler = async (req, res, next) => {
  try {
    if (!req.user) throw new HttpError(401, "Unauthorized");
    const body = createServiceKeySchema.parse(req.body);
    const scope = serviceKeyScope(req);
    const result = await createServiceKeyInMps({
      name: body.name,
      expiresInDays: body.expires_in_days,
      organizationId: scope.organizationId,
      createdBy: scope.createdBy
    });
    res.json(result);
  } catch (err) {
    next(err);
  }
};

const archiveServiceKey: RequestHandler = async (req, res, next) => {
  try {
    if (!req.user) throw new HttpError(401, "Unauthorized");
    const scope = serviceKeyScope(req);
    const success = await archiveServiceKeyInMps({
      serviceKeyId: String(req.params.service_key_id),
      organizationId: scope.organizationId,
      createdBy: scope.createdBy
    });
    if (!success) {
      throw new HttpError(
        404,
        "Service key not found, already archived, or access denied"
      );
    }
    res.json({ message: "Service key archived successfully" });
  } catch (err) {
    next(err);
  }
};

const reactivateServiceKey: RequestHandler = (_req, _res, next) => {
  next(
    new HttpError(
      501,
      "Service key reactivation is not supported. Once a service key is archived, it cannot be reactivated. Please create a new service key instead."
    )
  );
};

export const registerUserRoutes = (router: Router): void => {
  router.get("/user/configurations/defaults", getDefaultConfigurations);
  router.get("/user/auth/user", requireUser, getAuthUser);
  router.get("/user/configurations/user", requireUser, getUserConfigurations);
  router.put("/user/configurations/user", requireUser, updateUserConfigurations);
  router.get("/user/onboarding-state", requireUser, getOnboardingState);
  router.put("/user/onboarding-state", requireUser, updateOnboardingState);
  router.get(
    "/user/configurations/user/validate",
    requireUser,
    validateUserConfigurations
  );
  router.get("/user/configurations/voices/:provider", requireUser, getVoices);
  router.get("/user/service-keys", requireUser, listServiceKeys);
  router.post("/user/service-keys", requireUser, createServiceKey);
  router.delete("/user/service-keys/:service_key_id", requireUser, archiveServiceKey);
  router.put(
    "/user/service-keys/:service_key_id/reactivate",
    requireUser,
    reactivateServiceKey
  );
};
