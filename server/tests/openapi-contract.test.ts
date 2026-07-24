import assert from "node:assert/strict";
import test from "node:test";
import { httpMethods, loadOpenApiSnapshot } from "../src/openapi/loadOpenApi.js";
import { buildRouteCoverageSummary } from "../src/openapi/routeCoverage.js";

test("OpenAPI snapshot remains the FastAPI parity oracle", () => {
  const spec = loadOpenApiSnapshot();
  const operations = Object.values(spec.paths).flatMap((item) =>
    httpMethods.filter((method) => item[method])
  );

  assert.equal(Object.keys(spec.paths).length, 129);
  assert.equal(operations.length, 161);
  assert.ok(spec.paths["/api/v1/health"]?.get);
  assert.ok(spec.paths["/api/v1/workflow/{workflow_id}/runs"]?.post);
  assert.ok(spec.paths["/api/v1/public/embed/init"]?.post);
});

test("every documented OpenAPI operation has an explicit Express route", () => {
  const coverage = buildRouteCoverageSummary();
  assert.equal(coverage.expectedPathCount, 129);
  assert.equal(coverage.expectedOperationCount, 161);
  assert.equal(coverage.coveredOperationCount, 161);
  assert.deepEqual(coverage.missing, []);
});
