import { env } from "../../config/env.js";
import { HttpError } from "../../errors/httpError.js";

export type StackImpersonationSession = {
  refresh_token: string;
  access_token: string;
};

export type StackUser = {
  id: string;
  selected_team_id?: string | null;
  selected_team?: { id?: string | null } | null;
  primary_email?: string | null;
  primary_email_verified?: boolean | null;
};

const stackHeaders = (accessToken?: string): Record<string, string> => {
  if (!env.stackAuthApiUrl || !env.stackProjectId || !env.stackSecretServerKey) {
    throw new HttpError(500, "Stack Auth is not configured");
  }

  const headers: Record<string, string> = {
    "x-stack-access-type": "server",
    "x-stack-project-id": env.stackProjectId,
    "x-stack-secret-server-key": env.stackSecretServerKey
  };

  if (accessToken) {
    headers["x-stack-access-token"] = accessToken;
  }

  return headers;
};

export const stripBearerToken = (accessToken: string | null | undefined): string | null => {
  if (!accessToken) {
    return null;
  }
  return accessToken.startsWith("Bearer ")
    ? accessToken.slice("Bearer ".length)
    : accessToken;
};

export const getStackUser = async (
  authorization: string | null | undefined
): Promise<StackUser | null> => {
  const accessToken = stripBearerToken(authorization);
  if (!accessToken) {
    return null;
  }

  const response = await fetch(`${env.stackAuthApiUrl}/api/v1/users/me`, {
    headers: stackHeaders(accessToken)
  });

  if (!response.ok) {
    return null;
  }

  const data = (await response.json()) as Partial<StackUser>;
  return typeof data.id === "string" ? (data as StackUser) : null;
};

export const impersonateStackUser = async (
  stackUserId: string
): Promise<StackImpersonationSession> => {
  if (!env.stackAuthApiUrl || !env.stackProjectId || !env.stackSecretServerKey) {
    throw new HttpError(500, "Stack Auth is not configured");
  }

  const response = await fetch(`${env.stackAuthApiUrl}/api/v1/auth/sessions`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...stackHeaders()
    },
    body: JSON.stringify({
      user_id: stackUserId,
      expires_in_millis: 3_600_000,
      is_impersonation: true
    })
  });

  const data = (await response.json()) as Partial<StackImpersonationSession>;
  if (!response.ok || !data.refresh_token || !data.access_token) {
    throw new HttpError(502, "Failed to create Stack Auth impersonation session");
  }

  return {
    refresh_token: data.refresh_token,
    access_token: data.access_token
  };
};
