import fs from "node:fs";
import { repoPath } from "./repoRoot.js";

export const getAppVersion = (): string => {
  const pyprojectPath = repoPath("api/pyproject.toml");
  try {
    const contents = fs.readFileSync(pyprojectPath, "utf8");
    const match = contents.match(/^version\s*=\s*"([^"]+)"/m);
    return match?.[1] ?? "dev";
  } catch {
    return "dev";
  }
};
