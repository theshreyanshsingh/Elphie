import assert from "node:assert/strict";
import test from "node:test";
import {
  allNodeSpecs,
  getNodeSpec,
  specVersion
} from "../src/services/workflow/nodeSpecs.js";

test("node spec catalog exposes core workflow node types", () => {
  const specs = allNodeSpecs();
  assert.equal(specVersion, "1.0.0");
  assert.ok(specs.some((spec) => spec.name === "startCall"));
  assert.ok(specs.some((spec) => spec.name === "agent"));
  assert.ok(specs.some((spec) => spec.name === "endCall"));
  assert.equal(getNodeSpec("missing"), undefined);
});
