import { createApiRouter } from "../routes/index.js";
import { httpMethods, loadOpenApiSnapshot, type HttpMethod } from "./loadOpenApi.js";

type ExpressRouteLayer = {
  route?: {
    path: string | RegExp | Array<string | RegExp>;
    methods: Record<string, boolean>;
  };
};

export type RouteCoverageOperation = {
  method: Uppercase<HttpMethod>;
  openapiPath: string;
  expressPath: string;
  operationId: string | null;
};

export type RouteCoverageSummary = {
  expectedPathCount: number;
  expectedOperationCount: number;
  registeredOperationCount: number;
  coveredOperationCount: number;
  missing: RouteCoverageOperation[];
  operations: RouteCoverageOperation[];
};

const expressPathForOpenApi = (path: string): string =>
  path.replace(/^\/api\/v1/, "").replace(/\{([^}]+)\}/g, ":$1");

const routePathStrings = (
  path: string | RegExp | Array<string | RegExp>
): string[] => {
  if (Array.isArray(path)) {
    return path.flatMap(routePathStrings);
  }
  return typeof path === "string" ? [path] : [];
};

const registeredRoutes = (): Set<string> => {
  const router = createApiRouter() as unknown as { stack: ExpressRouteLayer[] };
  const registered = new Set<string>();

  for (const layer of router.stack) {
    if (!layer.route) continue;
    for (const routePath of routePathStrings(layer.route.path)) {
      for (const method of Object.keys(layer.route.methods)) {
        registered.add(`${method.toUpperCase()} ${routePath}`);
      }
    }
  }

  return registered;
};

export const buildRouteCoverageSummary = (): RouteCoverageSummary => {
  const spec = loadOpenApiSnapshot();
  const registered = registeredRoutes();
  const operations: RouteCoverageOperation[] = [];
  const missing: RouteCoverageOperation[] = [];

  for (const [path, item] of Object.entries(spec.paths)) {
    const expressPath = expressPathForOpenApi(path);
    for (const method of httpMethods) {
      const operation = item[method];
      if (!operation) continue;
      const entry: RouteCoverageOperation = {
        method: method.toUpperCase() as Uppercase<HttpMethod>,
        openapiPath: path,
        expressPath,
        operationId:
          typeof operation.operationId === "string" ? operation.operationId : null
      };
      operations.push(entry);
      if (!registered.has(`${entry.method} ${expressPath}`)) {
        missing.push(entry);
      }
    }
  }

  return {
    expectedPathCount: Object.keys(spec.paths).length,
    expectedOperationCount: operations.length,
    registeredOperationCount: registered.size,
    coveredOperationCount: operations.length - missing.length,
    missing,
    operations
  };
};
