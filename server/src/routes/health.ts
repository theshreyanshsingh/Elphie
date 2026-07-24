import type { Router } from "express";
import { env } from "../config/env.js";
import { getAppVersion } from "../utils/version.js";

export type HealthResponse = {
  status: string;
  version: string;
  backend_api_endpoint: string;
  deployment_mode: string;
  auth_provider: string;
  turn_enabled: boolean;
  force_turn_relay: boolean;
  stack_project_id?: string | null;
  stack_publishable_client_key?: string | null;
};

export const registerHealthRoute = (router: Router): void => {
  router.get("/health", (_req, res) => {
    const isStack = env.authProvider === "stack";
    const body: HealthResponse = {
      status: "ok",
      version: getAppVersion(),
      backend_api_endpoint: env.backendApiEndpoint,
      deployment_mode: env.deploymentMode,
      auth_provider: env.authProvider,
      turn_enabled: Boolean(env.turnSecret),
      force_turn_relay: env.forceTurnRelay,
      stack_project_id: isStack ? env.stackProjectId ?? null : null,
      stack_publishable_client_key: isStack
        ? env.stackPublishableClientKey ?? null
        : null
    };
    res.json(body);
  });
};
