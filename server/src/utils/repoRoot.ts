import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));

export const findRepoRoot = (): string => {
  const candidates = [
    process.cwd(),
    path.resolve(process.cwd(), ".."),
    path.resolve(here, "../../.."),
    path.resolve(here, "../../../..")
  ];

  for (const candidate of candidates) {
    if (
      fs.existsSync(path.join(candidate, "docs/api-reference/openapi.json")) &&
      fs.existsSync(path.join(candidate, "api"))
    ) {
      return candidate;
    }
  }

  return path.resolve(here, "../../..");
};

export const repoPath = (...parts: string[]): string =>
  path.join(findRepoRoot(), ...parts);
