import type { JsonObject, OrganizationPreferences } from "../../db/repositories/userConfigurations.js";

export type UserConfiguration = {
  llm?: JsonObject | null;
  tts?: JsonObject | null;
  stt?: JsonObject | null;
  embeddings?: JsonObject | null;
  realtime?: JsonObject | null;
  is_realtime?: boolean | null;
  test_phone_number?: string | null;
  timezone?: string | null;
  organization_pricing?: Record<string, string | number | boolean> | null;
  last_validated_at?: string | Date | null;
  [key: string]: unknown;
};

export const DEFAULT_SERVICE_PROVIDERS = {
  llm: "openai",
  tts: "elevenlabs",
  stt: "deepgram",
  embeddings: "openai"
} as const;

const serviceSchema = (
  provider: string,
  fields: Record<string, unknown> = {}
): Record<string, unknown> => ({
  type: "object",
  properties: {
    provider: { const: provider, default: provider, title: "Provider" },
    api_key: { type: "string", title: "Api Key" },
    ...fields
  },
  required: ["provider", "api_key"]
});

export const defaultConfigurationSchemas = () => ({
  llm: {
    openai: serviceSchema("openai", {
      model: { type: "string", default: "gpt-4o-mini", title: "Model" }
    }),
    elphie: serviceSchema("elphie", {
      model: { type: "string", default: "default", title: "Model" }
    })
  },
  tts: {
    elevenlabs: serviceSchema("elevenlabs", {
      model: { type: "string", default: "eleven_turbo_v2_5", title: "Model" },
      voice: { type: "string", title: "Voice" }
    }),
    deepgram: serviceSchema("deepgram", {
      model: { type: "string", default: "aura-2-thalia-en", title: "Model" },
      voice: { type: "string", title: "Voice" }
    }),
    sarvam: serviceSchema("sarvam", {
      model: { type: "string", default: "bulbul:v2", title: "Model" },
      voice: { type: "string", title: "Voice" }
    }),
    cartesia: serviceSchema("cartesia", {
      model: { type: "string", default: "sonic-2", title: "Model" },
      voice: { type: "string", title: "Voice" }
    }),
    elphie: serviceSchema("elphie", {
      model: { type: "string", default: "default", title: "Model" },
      voice: { type: "string", default: "default", title: "Voice" },
      speed: { type: "number", default: 1, title: "Speed" }
    }),
    rime: serviceSchema("rime", {
      model: { type: "string", title: "Model" },
      voice: { type: "string", title: "Voice" }
    })
  },
  stt: {
    deepgram: serviceSchema("deepgram", {
      model: { type: "string", default: "nova-3", title: "Model" },
      language: { type: "string", title: "Language" }
    }),
    elphie: serviceSchema("elphie", {
      model: { type: "string", default: "default", title: "Model" },
      language: { type: "string", default: "multi", title: "Language" }
    })
  },
  embeddings: {
    openai: serviceSchema("openai", {
      model: { type: "string", default: "text-embedding-3-small", title: "Model" }
    }),
    elphie: serviceSchema("elphie", {
      model: { type: "string", default: "default", title: "Model" }
    })
  },
  realtime: {
    openai_realtime: serviceSchema("openai_realtime", {
      model: { type: "string", default: "gpt-4o-realtime-preview", title: "Model" },
      voice: { type: "string", title: "Voice" }
    }),
    google_realtime: serviceSchema("google_realtime", {
      model: { type: "string", title: "Model" },
      voice: { type: "string", title: "Voice" }
    })
  },
  default_providers: DEFAULT_SERVICE_PROVIDERS
});

const SECRET_FIELDS = new Set([
  "api_key",
  "credentials",
  "aws_access_key",
  "aws_secret_key"
]);

const maskKey = (value: string): string => {
  if (value.length <= 4) {
    return "*".repeat(value.length);
  }
  return `${"*".repeat(value.length - 4)}${value.slice(-4)}`;
};

const maskValue = (value: unknown): unknown => {
  if (typeof value === "string") {
    return maskKey(value);
  }
  if (Array.isArray(value)) {
    return value.map((item) => (typeof item === "string" ? maskKey(item) : item));
  }
  return value;
};

const maskService = (service: unknown): JsonObject | null => {
  if (!service || typeof service !== "object" || Array.isArray(service)) {
    return null;
  }
  const masked = { ...(service as JsonObject) };
  for (const key of Object.keys(masked)) {
    if (SECRET_FIELDS.has(key) && masked[key]) {
      masked[key] = maskValue(masked[key]) as JsonObject[string];
    }
  }
  return masked;
};

export const maskUserConfig = (config: UserConfiguration): UserConfiguration => ({
  llm: maskService(config.llm),
  tts: maskService(config.tts),
  stt: maskService(config.stt),
  embeddings: maskService(config.embeddings),
  realtime: maskService(config.realtime),
  is_realtime: Boolean(config.is_realtime),
  test_phone_number: config.test_phone_number ?? null,
  timezone: config.timezone ?? null
});

const containsMask = (value: unknown): boolean => {
  if (typeof value === "string") {
    return value.includes("***");
  }
  if (Array.isArray(value)) {
    return value.some((item) => typeof item === "string" && item.includes("***"));
  }
  return false;
};

const mergeService = (
  existing: JsonObject | null | undefined,
  incoming: JsonObject | null | undefined
): JsonObject | null | undefined => {
  if (incoming == null) {
    return incoming;
  }
  if (!existing) {
    return incoming;
  }
  const sameProvider =
    !existing.provider || !incoming.provider || existing.provider === incoming.provider;
  if (!sameProvider) {
    return incoming;
  }
  const merged = { ...incoming };
  for (const key of SECRET_FIELDS) {
    if (existing[key] == null) {
      continue;
    }
    if (merged[key] == null || containsMask(merged[key])) {
      merged[key] = existing[key];
    }
  }
  return merged;
};

export const mergeUserConfigurations = (
  existing: UserConfiguration,
  incoming: UserConfiguration
): UserConfiguration => {
  const merged: UserConfiguration = { ...existing };
  for (const key of ["llm", "tts", "stt", "embeddings", "realtime"] as const) {
    if (Object.prototype.hasOwnProperty.call(incoming, key)) {
      merged[key] = mergeService(
        existing[key] as JsonObject | null | undefined,
        incoming[key] as JsonObject | null | undefined
      ) as UserConfiguration[typeof key];
    }
  }
  for (const key of ["is_realtime", "test_phone_number", "timezone"] as const) {
    if (Object.prototype.hasOwnProperty.call(incoming, key)) {
      merged[key] = incoming[key] as never;
    }
  }
  return merged;
};

export const applyOrganizationPreferences = (
  config: UserConfiguration,
  preferences: OrganizationPreferences
): UserConfiguration => ({
  ...config,
  ...(preferences.test_phone_number != null
    ? { test_phone_number: preferences.test_phone_number }
    : {}),
  ...(preferences.timezone != null ? { timezone: preferences.timezone } : {})
});
