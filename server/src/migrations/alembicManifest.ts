import fs from "node:fs";
import path from "node:path";
import { repoPath } from "../utils/repoRoot.js";

export type AlembicRevision = {
  revision: string;
  downRevision: string | null;
  downRevisions: string[];
  description: string;
  filename: string;
};

const revisionPattern = /^([0-9a-f]+)_(.+)\.py$/;
const revisionAssignmentPattern = /^revision:\s*str\s*=\s*["']([^"']+)["']/m;
const downRevisionAssignmentPattern = /^down_revision:[\s\S]*?=\s*([\s\S]*?)\nbranch_labels:/m;
const rootRevision = "93a1ddbb6ffd";

const parseDownRevisions = (raw: string): string[] => {
  const value = raw.trim();
  if (value === "None") return [];
  const quoted = value.match(/^["']([^"']+)["']/);
  if (quoted) return [quoted[1]!];
  if (value.startsWith("(") || value.startsWith("[")) {
    return [...value.matchAll(/["']([^"']+)["']/g)].map((match) => match[1]!);
  }
  throw new Error(`Could not parse down_revision assignment: ${raw}`);
};

export const discoverAlembicRevisions = (): AlembicRevision[] => {
  const versionsDir = repoPath("api/alembic/versions");
  const revisions = fs
    .readdirSync(versionsDir)
    .filter((filename) => filename.endsWith(".py") && filename !== "__init__.py")
    .map((filename): AlembicRevision | null => {
      const match = filename.match(revisionPattern);
      if (!match) {
        return null;
      }
      const fullPath = path.join(versionsDir, filename);
      const source = fs.readFileSync(fullPath, "utf8");
      const revision = source.match(revisionAssignmentPattern)?.[1];
      const downRevisionRaw = source.match(downRevisionAssignmentPattern)?.[1];
      if (!revision || downRevisionRaw == null) {
        throw new Error(`Could not parse Alembic identifiers from ${filename}`);
      }
      if (revision !== match[1]) {
        throw new Error(
          `Alembic filename/header revision mismatch in ${filename}: ${match[1]} != ${revision}`
        );
      }

      const downRevisions = parseDownRevisions(downRevisionRaw);
      return {
        revision,
        downRevision: downRevisions[0] ?? null,
        downRevisions,
        description: match[2].replace(/_/g, " "),
        filename: path.join("api/alembic/versions", filename)
      };
    })
    .filter((revision): revision is AlembicRevision => revision !== null);

  return orderAlembicRevisions(revisions);
};

export const orderAlembicRevisions = (
  revisions: AlembicRevision[],
  root = rootRevision
): AlembicRevision[] => {
  const byRevision = new Map(revisions.map((revision) => [revision.revision, revision]));
  const children = new Map<string | null, AlembicRevision[]>();
  for (const revision of revisions) {
    for (const parent of revision.downRevisions) {
      if (!byRevision.has(parent)) {
        throw new Error(
          `Alembic revision ${revision.revision} references missing parent ${parent}`
        );
      }
    }
    if (revision.downRevisions.length === 0) {
      const roots = children.get(null) ?? [];
      roots.push(revision);
      children.set(null, roots);
    }
    for (const parent of revision.downRevisions) {
      const siblings = children.get(parent) ?? [];
      siblings.push(revision);
      children.set(parent, siblings);
    }
  }

  const roots = children.get(null) ?? [];
  if (!roots.some((revision) => revision.revision === root)) {
    throw new Error(`Alembic root revision ${root} was not found`);
  }

  const ordered: AlembicRevision[] = [];
  const seen = new Set<string>();
  const queue: AlembicRevision[] = [byRevision.get(root)!];
  while (queue.length > 0) {
    const revision = queue.shift()!;
    if (seen.has(revision.revision)) continue;
    if (revision.downRevisions.some((parent) => !seen.has(parent))) {
      queue.push(revision);
      continue;
    }
    seen.add(revision.revision);
    ordered.push(revision);
    const next = [...(children.get(revision.revision) ?? [])].sort((a, b) =>
      a.revision.localeCompare(b.revision)
    );
    queue.push(...next);
  }

  if (ordered.length !== revisions.length) {
    const missing = revisions
      .filter((revision) => !seen.has(revision.revision))
      .map((revision) => revision.revision)
      .join(", ");
    throw new Error(`Alembic graph is disconnected; unreachable revisions: ${missing}`);
  }

  return ordered;
};
