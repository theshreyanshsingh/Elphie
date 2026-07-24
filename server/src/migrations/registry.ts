import fs from "node:fs/promises";
import pg from "pg";
import { repoPath } from "../utils/repoRoot.js";
import type { AlembicRevision } from "./alembicManifest.js";

export type MigrationContext = {
  client: pg.PoolClient;
};

export type NodeMigration = {
  id: string;
  alembicRevision: string;
  downRevisions: string[];
  description: string;
  up: (ctx: MigrationContext) => Promise<void>;
  down: (ctx: MigrationContext) => Promise<void>;
};

const bootstrapSchemaPath = repoPath(
  "server/src/migrations/sql/0000_alembic_head_schema.sql"
);

const dropAllPublicObjectsSql = `
DO $$
DECLARE
  item record;
BEGIN
  FOR item IN
    SELECT tablename AS name FROM pg_tables WHERE schemaname = 'public'
  LOOP
    EXECUTE format('DROP TABLE IF EXISTS public.%I CASCADE', item.name);
  END LOOP;

  FOR item IN
    SELECT typname AS name
    FROM pg_type
    WHERE typnamespace = 'public'::regnamespace
      AND typtype = 'e'
  LOOP
    EXECUTE format('DROP TYPE IF EXISTS public.%I CASCADE', item.name);
  END LOOP;
END $$;
`;

export const createNodeMigrations = (
  revisions: AlembicRevision[]
): NodeMigration[] => {
  const head = revisions.at(-1);
  if (!head) {
    return [];
  }

  return [
    {
      id: "0000_alembic_head_schema",
      alembicRevision: head.revision,
      downRevisions: head.downRevisions,
      description:
        "Create the current Dograh PostgreSQL schema and stamp Alembic head.",
      up: async ({ client }) => {
        await client.query(await fs.readFile(bootstrapSchemaPath, "utf8"));
      },
      down: async ({ client }) => {
        await client.query(dropAllPublicObjectsSql);
      }
    }
  ];
};
