import type { Router } from "express";
import { loadOpenApiSnapshot } from "../openapi/loadOpenApi.js";

export const registerOpenApiRoute = (router: Router): void => {
  router.get("/openapi.json", (_req, res) => {
    res.json(loadOpenApiSnapshot());
  });
};
