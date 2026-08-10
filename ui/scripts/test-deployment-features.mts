import * as mod from "../src/lib/deploymentFeatures.ts";

// tsx can surface this .ts module as a CJS interop namespace when imported
// from an .mts script; prefer named exports, fall back to default.
const deploymentFeatures =
  "isBillingAvailable" in mod && typeof mod.isBillingAvailable === "function"
    ? mod
    : (mod as { default: typeof mod }).default;

const cases: Array<[string, string | null | undefined, boolean]> = [
  ["unknown deployment", undefined, false],
  ["missing deployment", null, false],
  ["self-hosted deployment", "selfhosted", false],
  ["legacy oss deployment", "oss", false],
  ["SaaS deployment", "saas", true],
  ["cloud deployment", "cloud", true],
];

for (const [name, deploymentMode, expected] of cases) {
  const actual = deploymentFeatures.isBillingAvailable(deploymentMode);
  if (actual !== expected) {
    throw new Error(`${name}: expected ${expected}, received ${actual}`);
  }
  console.log(`PASS ${name}`);
}

console.log(`\nAll ${cases.length} deployment feature cases passed`);
