import cors from "cors";
import type { RequestHandler } from "express";
import { env } from "../config/env.js";

export const createCorsMiddleware = (): RequestHandler => {
  if (env.deploymentMode === "oss") {
    return cors({
      origin: "*",
      credentials: false,
      methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
      allowedHeaders: ["*"]
    });
  }

  if (env.corsAllowedOrigins.length === 0) {
    throw new Error(
      "CORS_ALLOWED_ORIGINS must be set when DEPLOYMENT_MODE != 'oss'"
    );
  }

  if (env.corsAllowedOrigins.includes("*")) {
    throw new Error(
      "CORS_ALLOWED_ORIGINS cannot contain '*' with credentialed requests"
    );
  }

  return cors({
    origin: env.corsAllowedOrigins,
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["*"]
  });
};

export const publicEmbedCors: RequestHandler = (req, res, next) => {
  if (req.path.startsWith("/api/v1/public/embed/")) {
    const origin = req.header("origin") ?? "*";
    res.setHeader("access-control-allow-origin", origin);
    res.setHeader("vary", "Origin");
    res.setHeader("access-control-allow-methods", "GET,POST,OPTIONS");
    res.setHeader("access-control-allow-headers", "content-type,authorization");
    res.setHeader("access-control-max-age", "86400");
  }
  next();
};
