import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { discoverAlembicRevisions } from "../src/migrations/alembicManifest.js";
import { createNodeMigrations } from "../src/migrations/registry.js";
import { repoPath } from "../src/utils/repoRoot.js";

const migrationSqlPath = repoPath(
  "server/src/migrations/sql/0000_alembic_head_schema.sql"
);

test("Alembic migration manifest preserves the Python revision graph", () => {
  const revisions = discoverAlembicRevisions();
  assert.equal(revisions.length, 90);
  assert.equal(revisions[0]?.revision, "93a1ddbb6ffd");
  assert.equal(revisions.at(-1)?.revision, "91cc6ba3e1c7");
  assert.ok(
    revisions.some(
      (revision) =>
        revision.revision === "4d8e9b2a3c5f" &&
        revision.downRevisions.includes("cdcf9f65913b") &&
        revision.downRevisions.includes("f2e1d0c9b8a7")
    )
  );
});

test("Node bootstrap schema is stamped to Alembic head", () => {
  const sql = fs.readFileSync(migrationSqlPath, "utf8");
  assert.match(sql, /CREATE EXTENSION IF NOT EXISTS vector;/);
  assert.match(sql, /CREATE TABLE IF NOT EXISTS alembic_version/);
  assert.match(sql, /CREATE TABLE IF NOT EXISTS node_schema_migrations/);
  assert.match(sql, /91cc6ba3e1c7/);

  for (const table of [
    "organizations",
    "workflows",
    "workflow_definitions",
    "workflow_runs",
    "telephony_configurations",
    "telephony_phone_numbers",
    "knowledge_base_chunks",
    "workflow_run_text_sessions"
  ]) {
    assert.ok(sql.includes(`CREATE TABLE ${table} (`));
  }
});

test("Node bootstrap schema does not generate duplicate index names", () => {
  const sql = fs.readFileSync(migrationSqlPath, "utf8");
  const indexNames = [...sql.matchAll(/CREATE (?:UNIQUE )?INDEX ([^ ]+) ON/g)].map(
    (match) => match[1]
  );
  const duplicates = indexNames.filter(
    (name, index) => indexNames.indexOf(name) !== index
  );
  assert.deepEqual(duplicates, []);
});

test("Node migration registry exposes executable migration metadata", () => {
  const revisions = discoverAlembicRevisions();
  const migrations = createNodeMigrations(revisions);
  assert.equal(migrations.length, 1);
  assert.equal(migrations[0]?.id, "0000_alembic_head_schema");
  assert.equal(migrations[0]?.alembicRevision, revisions.at(-1)?.revision);
  assert.equal(typeof migrations[0]?.up, "function");
  assert.equal(typeof migrations[0]?.down, "function");
});
