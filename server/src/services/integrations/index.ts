import { registerIntegrationPackage } from "./registry.js";

export const registerIntegrations = (): void => {
  registerIntegrationPackage({
    name: "tuner",
    nodeTypes: ["tuner"],
    hasRuntimeSessions: true,
    hasCompletionHandler: true
  });
};
