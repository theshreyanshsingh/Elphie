export type IntegrationRuntimeContext = {
  workflowRunId: number;
  workflowRun: unknown;
  workflowGraph: unknown;
  runDefinition: unknown;
  userConfig: unknown;
  isRealtime: boolean;
  contextMessagesProvider: () => Array<Record<string, unknown>>;
};

export type IntegrationPackageSpec = {
  name: string;
  nodeTypes: string[];
  hasRuntimeSessions: boolean;
  hasCompletionHandler: boolean;
};

const packages = new Map<string, IntegrationPackageSpec>();

export const registerIntegrationPackage = (
  spec: IntegrationPackageSpec
): IntegrationPackageSpec => {
  const existing = packages.get(spec.name);
  if (existing && existing !== spec) {
    throw new Error(`Integration package '${spec.name}' is already registered`);
  }
  packages.set(spec.name, spec);
  return spec;
};

export const allIntegrationPackages = (): IntegrationPackageSpec[] =>
  [...packages.values()].sort((a, b) => a.name.localeCompare(b.name));
