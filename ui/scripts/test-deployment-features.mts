import { isBillingAvailable } from "../src/lib/deploymentFeatures.ts";

const cases: Array<[string, string | null | undefined, boolean]> = [
  ["unknown deployment", undefined, false],
  ["missing deployment", null, false],
  ["OSS deployment", "oss", false],
  ["SaaS deployment", "saas", true],
  ["cloud deployment", "cloud", true],
];

for (const [name, deploymentMode, expected] of cases) {
  const actual = isBillingAvailable(deploymentMode);
  if (actual !== expected) {
    throw new Error(`${name}: expected ${expected}, received ${actual}`);
  }
  console.log(`PASS ${name}`);
}

console.log(`\nAll ${cases.length} deployment feature cases passed`);
