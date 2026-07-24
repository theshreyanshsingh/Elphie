const templateVarPattern =
  /\{\{\s*([^|\s}]+)(?:\s*\|\s*([^:}]+)(?::([^}]+))?)?\s*\}\}/g;

const valueAtPath = (
  context: Record<string, unknown>,
  path: string
): unknown => {
  const direct = context[path];
  if (direct != null || !path.includes(".")) return direct;
  return path.split(".").reduce<unknown>((current, part) => {
    if (!current || typeof current !== "object" || Array.isArray(current)) {
      return undefined;
    }
    return (current as Record<string, unknown>)[part];
  }, context);
};

export const renderTemplate = (
  template: string,
  context: Record<string, unknown>
): string =>
  template.replace(templateVarPattern, (_match, rawName: string, filter?: string, fallback?: string) => {
    const name = rawName.trim();
    const value = valueAtPath(context, name);
    if (value == null) {
      if (filter && fallback != null) {
        return fallback.trim();
      }
      return "";
    }
    return String(value);
  });

export const extractTemplateVariables = (text: string): Set<string> => {
  const variables = new Set<string>();
  const systemVariables = new Set(["campaign_id", "provider", "source_uuid"]);
  for (const match of text.matchAll(templateVarPattern)) {
    const name = match[1]?.trim();
    const filter = match[2]?.trim();
    if (!name || name.includes(".") || filter || systemVariables.has(name)) {
      continue;
    }
    variables.add(name);
  }
  return variables;
};
