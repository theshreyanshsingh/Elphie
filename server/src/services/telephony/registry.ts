export type ProviderUIField = {
  name: string;
  label: string;
  type: "text" | "password" | "textarea" | "string-array" | "number";
  required: boolean;
  sensitive: boolean;
  description?: string;
  placeholder?: string;
};

export type ProviderUIMetadata = {
  displayName: string;
  fields: ProviderUIField[];
  docsUrl?: string;
};

export type ProviderSpec = {
  name: string;
  transportSampleRate: number;
  accountIdCredentialField: string;
  uiMetadata?: ProviderUIMetadata;
};

const registry = new Map<string, ProviderSpec>();

export const registerProvider = (spec: ProviderSpec): ProviderSpec => {
  const existing = registry.get(spec.name);
  if (existing && existing !== spec) {
    throw new Error(`Provider '${spec.name}' is already registered`);
  }
  registry.set(spec.name, spec);
  return spec;
};

export const getProvider = (name: string): ProviderSpec => {
  const spec = registry.get(name);
  if (!spec) {
    throw new Error(`Unknown telephony provider: ${name}`);
  }
  return spec;
};

export const getOptionalProvider = (name: string): ProviderSpec | undefined =>
  registry.get(name);

export const allProviders = (): ProviderSpec[] =>
  [...registry.values()].sort((a, b) => a.name.localeCompare(b.name));
