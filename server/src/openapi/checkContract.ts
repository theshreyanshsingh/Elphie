import { loadOpenApiSnapshot, httpMethods } from "./loadOpenApi.js";
import { buildRouteCoverageSummary } from "./routeCoverage.js";

const spec = loadOpenApiSnapshot();
const operations = Object.entries(spec.paths).flatMap(([path, item]) =>
  httpMethods
    .filter((method) => item[method])
    .map((method) => `${method.toUpperCase()} ${path}`)
);

if (Object.keys(spec.paths).length !== 129) {
  throw new Error(`Expected 129 OpenAPI paths, found ${Object.keys(spec.paths).length}`);
}

if (operations.length !== 161) {
  throw new Error(`Expected 161 OpenAPI operations, found ${operations.length}`);
}

const coverage = buildRouteCoverageSummary();
if (coverage.missing.length > 0) {
  console.error(
    JSON.stringify(
      {
        status: "missing_express_routes",
        expected_operations: coverage.expectedOperationCount,
        covered_operations: coverage.coveredOperationCount,
        missing: coverage.missing
      },
      null,
      2
    )
  );
  process.exit(1);
}

console.log(
  `OpenAPI snapshot OK: ${Object.keys(spec.paths).length} paths, ${operations.length} operations`
);
console.log(
  `Express route coverage OK: ${coverage.coveredOperationCount}/${coverage.expectedOperationCount} documented operations`
);
