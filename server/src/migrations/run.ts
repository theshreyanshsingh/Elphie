import { inspect } from "node:util";
import pg from "pg";
import { env } from "../config/env.js";
import { discoverAlembicRevisions } from "./alembicManifest.js";
import { createNodeMigrations } from "./registry.js";

const { Pool } = pg;

const revisions = discoverAlembicRevisions();
const latestRevision = revisions.at(-1)?.revision;
const migrations = createNodeMigrations(revisions);

type MigrationSummary = {
  alembic_revisions_discovered: number;
  latest_revision: string | null;
  status: "already_current" | "applied" | "reverted" | "blocked";
  applied_migrations: string[];
  reverted_migrations?: string[];
  detail?: string;
};

const printSummary = (summary: MigrationSummary): void => {
  const stream = summary.status === "blocked" ? process.stderr : process.stdout;
  stream.write(`${JSON.stringify(summary, null, 2)}\n`);
};

const describeError = (error: unknown): string => {
  if (error instanceof AggregateError) {
    return error.errors.map((inner) => describeError(inner)).join("; ");
  }
  if (error instanceof Error) {
    return error.message || error.stack || error.name;
  }
  return inspect(error);
};

const readCurrentRevision = async (client: pg.PoolClient): Promise<string | null> => {
  const exists = await client.query<{ exists: boolean }>(
    "SELECT to_regclass('public.alembic_version') IS NOT NULL AS exists"
  );
  if (!exists.rows[0]?.exists) {
    return null;
  }
  const result = await client.query<{ version_num: string }>(
    "SELECT version_num FROM alembic_version ORDER BY version_num LIMIT 1"
  );
  return result.rows[0]?.version_num ?? null;
};

const ensureNodeMigrationTable = async (client: pg.PoolClient): Promise<void> => {
  await client.query(`
    CREATE TABLE IF NOT EXISTS node_schema_migrations (
      id VARCHAR(128) NOT NULL PRIMARY KEY,
      alembic_revision VARCHAR(32) NOT NULL,
      applied_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
    )
  `);
};

const readAppliedNodeMigrations = async (
  client: pg.PoolClient
): Promise<string[]> => {
  const exists = await client.query<{ exists: boolean }>(
    "SELECT to_regclass('public.node_schema_migrations') IS NOT NULL AS exists"
  );
  if (!exists.rows[0]?.exists) {
    return [];
  }
  const rows = await client.query<{ id: string }>(
    "SELECT id FROM node_schema_migrations ORDER BY applied_at, id"
  );
  return rows.rows.map((row) => row.id);
};

const countPublicTables = async (client: pg.PoolClient): Promise<number> => {
  const result = await client.query<{ count: string }>(`
    SELECT count(*)::text AS count
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_type = 'BASE TABLE'
      AND table_name != 'alembic_version'
  `);
  return Number.parseInt(result.rows[0]?.count ?? "0", 10);
};

const run = async (): Promise<void> => {
  const direction = process.argv[2] ?? "up";
  const target = process.argv[3] ?? "head";
  if (direction !== "up" && direction !== "down") {
    printSummary({
      alembic_revisions_discovered: revisions.length,
      latest_revision: latestRevision ?? null,
      status: "blocked",
      applied_migrations: [],
      detail: "Usage: npm run migrate -- up [head] or npm run migrate -- down base"
    });
    process.exitCode = 1;
    return;
  }

  if (!latestRevision) {
    throw new Error("No Alembic revisions were discovered.");
  }

  const pool = new Pool({ connectionString: env.databaseUrl });
  const client = await pool.connect();
  try {
    const currentRevision = await readCurrentRevision(client);
    const appliedNodeMigrations = await readAppliedNodeMigrations(client);
    if (direction === "up" && currentRevision === latestRevision) {
      printSummary({
        alembic_revisions_discovered: revisions.length,
        latest_revision: latestRevision,
        status: "already_current",
        applied_migrations: []
      });
      return;
    }

    const publicTableCount = await countPublicTables(client);
    if (direction === "down") {
      if (target !== "base") {
        printSummary({
          alembic_revisions_discovered: revisions.length,
          latest_revision: latestRevision,
          status: "blocked",
          applied_migrations: appliedNodeMigrations,
          detail: "Only downgrade target 'base' is currently supported."
        });
        process.exitCode = 1;
        return;
      }
      if (currentRevision !== latestRevision || appliedNodeMigrations.length === 0) {
        printSummary({
          alembic_revisions_discovered: revisions.length,
          latest_revision: latestRevision,
          status: "blocked",
          applied_migrations: appliedNodeMigrations,
          detail:
            "Downgrade is only supported for schemas created by the Node migration runner at the current Alembic head."
        });
        process.exitCode = 1;
        return;
      }

      await client.query("BEGIN");
      try {
        for (const migration of [...migrations].reverse()) {
          await migration.down({ client });
        }
        await client.query("COMMIT");
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      }

      printSummary({
        alembic_revisions_discovered: revisions.length,
        latest_revision: latestRevision,
        status: "reverted",
        applied_migrations: [],
        reverted_migrations: [...migrations].reverse().map((migration) => migration.id)
      });
      return;
    }

    if (target !== "head" && target !== latestRevision) {
      printSummary({
        alembic_revisions_discovered: revisions.length,
        latest_revision: latestRevision,
        status: "blocked",
        applied_migrations: appliedNodeMigrations,
        detail:
          "Targeted upgrades require converted per-revision migration bodies; only 'head' is currently available."
      });
      process.exitCode = 1;
      return;
    }

    if (currentRevision != null || publicTableCount > 0) {
      printSummary({
        alembic_revisions_discovered: revisions.length,
        latest_revision: latestRevision,
        status: "blocked",
        applied_migrations: appliedNodeMigrations,
        detail:
          "Database is not empty and is not stamped at the current Alembic head. Run the Python Alembic history first or use an empty database for Node bootstrap."
      });
      process.exitCode = 1;
      return;
    }

    await client.query("BEGIN");
    try {
      for (const migration of migrations) {
        await migration.up({ client });
      }
      await ensureNodeMigrationTable(client);
      for (const migration of migrations) {
        await client.query(
          `
            INSERT INTO node_schema_migrations (id, alembic_revision)
            VALUES ($1, $2)
            ON CONFLICT (id) DO NOTHING
          `,
          [migration.id, migration.alembicRevision]
        );
      }
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    }

    printSummary({
      alembic_revisions_discovered: revisions.length,
      latest_revision: latestRevision,
      status: "applied",
      applied_migrations: migrations.map((migration) => migration.id)
    });
  } finally {
    client.release();
    await pool.end();
  }
};

run().catch((error: unknown) => {
  printSummary({
    alembic_revisions_discovered: revisions.length,
    latest_revision: latestRevision ?? null,
    status: "blocked",
    applied_migrations: [],
    detail: describeError(error)
  });
  process.exitCode = 1;
});
