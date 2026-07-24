import assert from "node:assert/strict";
import test from "node:test";
import { functionNames } from "../src/tasks/functionNames.js";
import { taskHandlers } from "../src/tasks/handlers.js";

test("BullMQ task handlers are registered for every ARQ parity job", async () => {
  for (const name of Object.values(functionNames)) {
    const result = await taskHandlers[name]("arg");
    assert.equal(result.status, "skipped");
    assert.equal(result.task, name);
    assert.equal(typeof result.detail, "string");
  }
});
