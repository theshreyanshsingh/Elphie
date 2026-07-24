import { buildRouteCoverageSummary } from "./routeCoverage.js";

const coverage = buildRouteCoverageSummary();

for (const operation of coverage.operations) {
  process.stdout.write(
    `${operation.method.padEnd(7)} ${operation.openapiPath} -> ${operation.expressPath} ${operation.operationId ?? ""}\n`
  );
}

process.stdout.write(
  `\n${coverage.coveredOperationCount}/${coverage.expectedOperationCount} documented operations covered by Express routes.\n`
);

if (coverage.missing.length > 0) {
  process.stderr.write(`Missing routes:\n${JSON.stringify(coverage.missing, null, 2)}\n`);
  process.exit(1);
}
