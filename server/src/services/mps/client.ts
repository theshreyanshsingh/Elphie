import { env } from "../../config/env.js";
import { HttpError } from "../../errors/httpError.js";

export type MpsScope = {
  organizationId?: number | null;
  createdBy?: string | null;
};

const headersForScope = (scope: MpsScope = {}): Record<string, string> => {
  const headers: Record<string, string> = {
    "Content-Type": "application/json"
  };

  if (env.deploymentMode === "oss") {
    if (scope.createdBy) {
      headers["X-Created-By"] = scope.createdBy;
    }
  } else {
    if (env.dograhMpsSecretKey) {
      headers["X-Secret-Key"] = env.dograhMpsSecretKey;
    }
    if (scope.organizationId) {
      headers["X-Organization-Id"] = String(scope.organizationId);
    }
  }

  return headers;
};

const urlWithParams = (
  path: string,
  params: Record<string, string | number | boolean | null | undefined> = {}
): string => {
  const url = new URL(path, env.mpsApiUrl);
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== false) {
      url.searchParams.set(key, String(value));
    }
  }
  return url.toString();
};

const jsonRequest = async <T>(
  path: string,
  init: RequestInit,
  scope: MpsScope = {}
): Promise<T> => {
  const response = await fetch(urlWithParams(path), {
    ...init,
    headers: {
      ...headersForScope(scope),
      ...(init.headers ?? {})
    }
  });
  if (!response.ok) {
    const text = await response.text();
    throw new HttpError(response.status, text || "MPS request failed");
  }
  return (await response.json()) as T;
};

export const getServiceKeysFromMps = async (input: {
  includeArchived?: boolean;
  organizationId?: number | null;
  createdBy?: string | null;
}): Promise<Array<Record<string, unknown>>> => {
  const params =
    env.deploymentMode === "oss"
      ? { created_by: input.createdBy ?? undefined }
      : { organization_id: input.organizationId ?? undefined };
  const url = urlWithParams("/api/v1/service-keys/", {
    ...params,
    include_archived: input.includeArchived ? "true" : undefined
  });
  const response = await fetch(url, {
    headers: headersForScope({
      organizationId: input.organizationId,
      createdBy: input.createdBy
    })
  });
  if (!response.ok) {
    return [];
  }
  const keys = (await response.json()) as Array<Record<string, unknown>>;
  return keys.map((key) => ({
    id: key.id,
    name: key.name,
    key_prefix: key.key_prefix ?? "",
    is_active: key.is_active ?? true,
    created_at: key.created_at,
    last_used_at: key.last_used_at ?? null,
    expires_at: key.expires_at ?? null,
    archived_at: key.archived_at ?? null,
    created_by: key.created_by ?? null
  }));
};

export const createServiceKeyInMps = async (input: {
  name: string;
  expiresInDays?: number | null;
  organizationId?: number | null;
  createdBy?: string | null;
}): Promise<Record<string, unknown>> => {
  const body: Record<string, unknown> = {
    name: input.name,
    description:
      env.deploymentMode === "oss"
        ? `Service key: ${input.name}`
        : `Service key for organization ${input.organizationId}`,
    expires_in_days: input.expiresInDays ?? 90,
    created_by: input.createdBy
  };
  if (env.deploymentMode !== "oss" && input.organizationId) {
    body.organization_id = input.organizationId;
  }

  const data = await jsonRequest<Record<string, unknown>>(
    "/api/v1/service-keys/",
    {
      method: "POST",
      body: JSON.stringify(body)
    },
    {
      organizationId: input.organizationId,
      createdBy: input.createdBy
    }
  );

  const serviceKey =
    typeof data.service_key === "string" ? data.service_key : "";
  return {
    id: data.id,
    name: data.name ?? input.name,
    service_key: serviceKey,
    key_prefix: data.key_prefix ?? serviceKey.slice(0, 8),
    expires_at: data.expires_at ?? null,
    created_at: data.created_at,
    is_active: data.is_active ?? true,
    created_by: data.created_by ?? null
  };
};

export const archiveServiceKeyInMps = async (input: {
  serviceKeyId: string;
  organizationId?: number | null;
  createdBy?: string | null;
}): Promise<boolean> => {
  const response = await fetch(
    urlWithParams(`/api/v1/service-keys/${encodeURIComponent(input.serviceKeyId)}`),
    {
      method: "DELETE",
      headers: headersForScope({
        organizationId: input.organizationId,
        createdBy: input.createdBy
      })
    }
  );
  return response.ok;
};

export const getVoicesFromMps = async (input: {
  provider: string;
  model?: string | null;
  language?: string | null;
  q?: string | null;
  gender?: string | null;
  accent?: string | null;
  organizationId?: number | null;
  createdBy?: string | null;
}): Promise<Record<string, unknown>> => {
  const url = urlWithParams(`/api/v1/voice-proxy/${input.provider}/voices`, {
    model: input.model,
    language: input.language,
    q: input.q,
    gender: input.gender,
    accent: input.accent
  });
  const response = await fetch(url, {
    headers: headersForScope({
      organizationId: input.organizationId,
      createdBy: input.createdBy
    })
  });
  if (!response.ok) {
    const text = await response.text();
    throw new HttpError(500, text || `Failed to fetch voices for ${input.provider}`);
  }
  return (await response.json()) as Record<string, unknown>;
};

export type MpsWorkflowData = {
  name?: string;
  workflow_definition?: Record<string, unknown>;
} & Record<string, unknown>;

export const createWorkflowViaMps = async (input: {
  callType: string;
  useCase: string;
  activityDescription: string;
  organizationId?: number | null;
  createdBy?: string | null;
}): Promise<MpsWorkflowData> =>
  jsonRequest<MpsWorkflowData>(
    "/api/v1/workflow/create-workflow",
    {
      method: "POST",
      body: JSON.stringify({
        call_type: input.callType,
        use_case: input.useCase,
        activity_description: input.activityDescription
      })
    },
    {
      organizationId: input.organizationId,
      createdBy: input.createdBy
    }
  );

export const transcribeAudioWithMps = async (input: {
  audioData: Buffer;
  filename: string;
  contentType: string;
  language: string;
  model?: string;
  organizationId?: number | null;
  createdBy?: string | null;
}): Promise<Record<string, unknown>> => {
  const form = new FormData();
  form.set(
    "file",
    new Blob([input.audioData], { type: input.contentType }),
    input.filename
  );
  form.set("language", input.language);
  form.set("model", input.model ?? "default");

  const headers = headersForScope({
    organizationId: input.organizationId,
    createdBy: input.createdBy
  });
  delete headers["Content-Type"];

  const response = await fetch(urlWithParams("/api/v1/stt/transcribe"), {
    method: "POST",
    body: form,
    headers
  });
  if (!response.ok) {
    const text = await response.text();
    throw new HttpError(500, text || "Failed to transcribe audio");
  }
  return (await response.json()) as Record<string, unknown>;
};
