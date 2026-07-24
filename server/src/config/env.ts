import fs from "node:fs";
import dotenv from "dotenv";
import { repoPath } from "../utils/repoRoot.js";

const loadEnvFile = (path: string): void => {
  if (fs.existsSync(path)) {
    dotenv.config({ path, override: false });
  }
};

loadEnvFile(repoPath(".env"));
loadEnvFile(repoPath("api/.env"));
loadEnvFile(repoPath("server/.env"));

const boolFromEnv = (value: string | undefined, fallback = false): boolean => {
  if (value == null || value === "") {
    return fallback;
  }
  return value.toLowerCase() === "true";
};

const intFromEnv = (value: string | undefined, fallback: number): number => {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isFinite(parsed) ? parsed : fallback;
};

export const normalizeDatabaseUrl = (url: string): string =>
  url
    .replace(/^postgresql\+asyncpg:\/\//, "postgresql://")
    .replace(/^postgres\+asyncpg:\/\//, "postgres://");

const required = (name: string): string => {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} is required`);
  }
  return value;
};

export const env = {
  environment: process.env.ENVIRONMENT ?? "local",
  logLevel: process.env.LOG_LEVEL ?? "DEBUG",
  deploymentMode: process.env.DEPLOYMENT_MODE ?? "oss",
  corsAllowedOrigins: (process.env.CORS_ALLOWED_ORIGINS ?? "")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean),
  authProvider: process.env.AUTH_PROVIDER ?? "local",
  stackProjectId: process.env.STACK_AUTH_PROJECT_ID,
  stackPublishableClientKey: process.env.STACK_PUBLISHABLE_CLIENT_KEY,
  stackSecretServerKey: process.env.STACK_SECRET_SERVER_KEY,
  stackAuthApiUrl: process.env.STACK_AUTH_API_URL,
  backendApiEndpoint:
    process.env.BACKEND_API_ENDPOINT ?? "http://localhost:8000",
  uiAppUrl: process.env.UI_APP_URL ?? "http://localhost:3010",
  databaseUrl: normalizeDatabaseUrl(required("DATABASE_URL")),
  redisUrl: required("REDIS_URL"),
  enableAwsS3: boolFromEnv(process.env.ENABLE_AWS_S3),
  minioEndpoint: process.env.MINIO_ENDPOINT ?? "localhost:9000",
  minioPublicEndpoint: process.env.MINIO_PUBLIC_ENDPOINT,
  minioAccessKey: process.env.MINIO_ACCESS_KEY ?? "minioadmin",
  minioSecretKey: process.env.MINIO_SECRET_KEY ?? "minioadmin",
  minioBucket: process.env.MINIO_BUCKET ?? "voice-audio",
  minioSecure: boolFromEnv(process.env.MINIO_SECURE),
  s3Bucket: process.env.S3_BUCKET,
  s3Region: process.env.S3_REGION ?? "us-east-1",
  sentryDsn: process.env.SENTRY_DSN,
  enableTelemetry: boolFromEnv(process.env.ENABLE_TELEMETRY),
  posthogApiKey: process.env.POSTHOG_API_KEY,
  posthogHost: process.env.POSTHOG_HOST ?? "https://us.i.posthog.com",
  turnSecret: process.env.TURN_SECRET,
  turnHost: process.env.TURN_HOST ?? "localhost",
  turnPort: intFromEnv(process.env.TURN_PORT, 3478),
  turnTlsPort: intFromEnv(process.env.TURN_TLS_PORT, 5349),
  turnCredentialTtl: intFromEnv(process.env.TURN_CREDENTIAL_TTL, 86400),
  forceTurnRelay: boolFromEnv(process.env.FORCE_TURN_RELAY),
  ossJwtSecret: process.env.OSS_JWT_SECRET ?? "change-me-in-production",
  ossJwtExpiryHours: intFromEnv(process.env.OSS_JWT_EXPIRY_HOURS, 720),
  mpsApiUrl: process.env.MPS_API_URL ?? "https://services.dograh.com",
  dograhMpsSecretKey: process.env.DOGRAH_MPS_SECRET_KEY,
  // Python call-engine microservice (pipecat WebRTC pipeline). Express does not
  // run the voice pipeline itself; it reverse-proxies signaling WebSockets here.
  callServiceUrl: (process.env.CALL_SERVICE_URL ?? "ws://localhost:8001").replace(
    /\/$/,
    ""
  )
} as const;
