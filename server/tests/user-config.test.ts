import assert from "node:assert/strict";
import test from "node:test";
import {
  applyOrganizationPreferences,
  maskUserConfig,
  mergeUserConfigurations
} from "../src/services/configuration/userConfig.js";
import {
  applyOnboardingUpdate,
  defaultOnboardingState,
  parseOnboardingState
} from "../src/services/onboarding/state.js";

test("user configuration masking hides service secrets", () => {
  const masked = maskUserConfig({
    llm: {
      provider: "openai",
      api_key: "sk-1234567890",
      model: "gpt-4o-mini"
    },
    is_realtime: false
  });

  assert.equal(masked.llm?.api_key, "*********7890");
  assert.equal(masked.llm?.model, "gpt-4o-mini");
  assert.equal(masked.is_realtime, false);
});

test("user configuration merge preserves existing secrets when client sends masks", () => {
  const merged = mergeUserConfigurations(
    {
      llm: {
        provider: "openai",
        api_key: "sk-real-secret",
        model: "gpt-4o-mini"
      }
    },
    {
      llm: {
        provider: "openai",
        api_key: "********cret",
        model: "gpt-4o"
      }
    }
  );

  assert.equal(merged.llm?.api_key, "sk-real-secret");
  assert.equal(merged.llm?.model, "gpt-4o");
});

test("organization preferences override user-visible phone and timezone", () => {
  const config = applyOrganizationPreferences(
    {
      test_phone_number: "+10000000000",
      timezone: "UTC"
    },
    {
      test_phone_number: "+12223334444",
      timezone: "America/New_York"
    }
  );

  assert.equal(config.test_phone_number, "+12223334444");
  assert.equal(config.timezone, "America/New_York");
});

test("onboarding updates union list fields like the Python schema", () => {
  const state = applyOnboardingUpdate(defaultOnboardingState(), {
    skipped: true,
    seen_tooltips: ["welcome", "welcome", "phone"],
    completed_actions: ["create_workflow"]
  });
  const updated = applyOnboardingUpdate(state, {
    seen_tooltips: ["publish", "phone"],
    completed_actions: ["create_workflow", "run_test"]
  });

  assert.equal(updated.skipped, true);
  assert.deepEqual(updated.seen_tooltips, ["welcome", "phone", "publish"]);
  assert.deepEqual(updated.completed_actions, ["create_workflow", "run_test"]);
});

test("onboarding parser falls back to defaults for malformed stored JSON", () => {
  assert.deepEqual(parseOnboardingState({ skipped: "yes" }), {
    completed_at: null,
    skipped: false,
    seen_tooltips: [],
    completed_actions: []
  });
});
