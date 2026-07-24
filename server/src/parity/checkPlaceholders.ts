import fs from "node:fs";
import path from "node:path";
import { repoPath } from "../utils/repoRoot.js";

const bannedPatterns = [
  "node_migration_not_implemented",
  "not ported",
  "not fully ported",
  "not_ready",
  "has not been ported",
  "not implemented",
  "sql_conversion_required",
  "pending_runtime",
  "relayed: true",
  'status: "queued"'
];

const scanRoots = ["server/src"];
const ignoredDirs = new Set(["node_modules", "dist"]);
const ignoredFiles = new Set(["server/src/parity/checkPlaceholders.ts"]);

const walk = (dir: string): string[] => {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    if (ignoredDirs.has(entry.name)) {
      continue;
    }
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...walk(fullPath));
    } else if (entry.isFile() && /\.(ts|js|json|md)$/.test(entry.name)) {
      files.push(fullPath);
    }
  }
  return files;
};

const findings: string[] = [];

for (const root of scanRoots) {
  for (const file of walk(repoPath(root))) {
    const relative = path.relative(repoPath(), file);
    if (ignoredFiles.has(relative)) {
      continue;
    }
    const lines = fs.readFileSync(file, "utf8").split(/\r?\n/);
    lines.forEach((line, index) => {
      for (const pattern of bannedPatterns) {
        if (line.includes(pattern)) {
          findings.push(`${relative}:${index + 1}: ${pattern}`);
        }
      }
    });
  }
}

if (findings.length > 0) {
  console.error("Migration placeholder gate failed:");
  console.error(findings.join("\n"));
  process.exit(1);
}

console.log("Migration placeholder gate passed.");
