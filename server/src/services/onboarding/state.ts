import type { JsonObject } from "../../db/repositories/userConfigurations.js";

export type OnboardingState = {
  completed_at: string | null;
  skipped: boolean;
  seen_tooltips: string[];
  completed_actions: string[];
};

export type OnboardingStateUpdate = {
  completed_at?: string | null;
  skipped?: boolean | null;
  seen_tooltips?: string[] | null;
  completed_actions?: string[] | null;
};

export const defaultOnboardingState = (): OnboardingState => ({
  completed_at: null,
  skipped: false,
  seen_tooltips: [],
  completed_actions: []
});

const stringList = (value: unknown): string[] =>
  Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];

export const parseOnboardingState = (
  value: JsonObject | null | undefined
): OnboardingState => {
  if (!value) {
    return defaultOnboardingState();
  }
  return {
    completed_at:
      typeof value.completed_at === "string" ? value.completed_at : null,
    skipped: typeof value.skipped === "boolean" ? value.skipped : false,
    seen_tooltips: stringList(value.seen_tooltips),
    completed_actions: stringList(value.completed_actions)
  };
};

const unionList = (left: string[], right: string[] | null | undefined): string[] => {
  const result = [...left];
  for (const item of right ?? []) {
    if (!result.includes(item)) {
      result.push(item);
    }
  }
  return result;
};

export const applyOnboardingUpdate = (
  state: OnboardingState,
  update: OnboardingStateUpdate
): OnboardingState => ({
  completed_at:
    update.completed_at !== undefined ? update.completed_at : state.completed_at,
  skipped: update.skipped !== undefined && update.skipped !== null ? update.skipped : state.skipped,
  seen_tooltips: unionList(state.seen_tooltips, update.seen_tooltips),
  completed_actions: unionList(state.completed_actions, update.completed_actions)
});
