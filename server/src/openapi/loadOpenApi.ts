import fs from "node:fs";
import { repoPath } from "../utils/repoRoot.js";

export type OpenApiOperation = {
  operationId?: string;
  tags?: string[];
  summary?: string;
  description?: string;
  [key: string]: unknown;
};

export type OpenApiPathItem = {
  get?: OpenApiOperation;
  post?: OpenApiOperation;
  put?: OpenApiOperation;
  patch?: OpenApiOperation;
  delete?: OpenApiOperation;
  options?: OpenApiOperation;
  head?: OpenApiOperation;
  [key: string]: unknown;
};

export type OpenApiDocument = {
  openapi: string;
  info: Record<string, unknown>;
  paths: Record<string, OpenApiPathItem>;
  components?: Record<string, unknown>;
  servers?: Array<Record<string, unknown>>;
  [key: string]: unknown;
};

export const openApiSnapshotPath = (): string =>
  repoPath("docs/api-reference/openapi.json");

export const loadOpenApiSnapshot = (): OpenApiDocument => {
  const raw = fs.readFileSync(openApiSnapshotPath(), "utf8");
  return JSON.parse(raw) as OpenApiDocument;
};

export const httpMethods = [
  "get",
  "post",
  "put",
  "patch",
  "delete",
  "options",
  "head"
] as const;

export type HttpMethod = (typeof httpMethods)[number];
