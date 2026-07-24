import pg from "pg";

const { Pool } = pg;

type Snapshot = {
  columns: Record<string, unknown>[];
  enums: Record<string, unknown>[];
  indexes: Record<string, unknown>[];
  constraints: Record<string, unknown>[];
};

const normalizeDatabaseUrl = (url: string): string =>
  url
    .replace(/^postgresql\+asyncpg:\/\//, "postgresql://")
    .replace(/^postgres\+asyncpg:\/\//, "postgres://");

const required = (name: string): string => {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} is required`);
  }
  return normalizeDatabaseUrl(value);
};

const snapshot = async (connectionString: string): Promise<Snapshot> => {
  const pool = new Pool({ connectionString });
  try {
    const client = await pool.connect();
    try {
      const columns = await client.query(`
          SELECT table_name, column_name, data_type, udt_name, is_nullable,
                 column_default, character_maximum_length
          FROM information_schema.columns
          WHERE table_schema = 'public'
            AND table_name != 'node_schema_migrations'
          ORDER BY table_name, ordinal_position
        `);
      const enums = await client.query(`
          SELECT t.typname AS enum_name, e.enumlabel AS enum_value
          FROM pg_type t
          JOIN pg_enum e ON e.enumtypid = t.oid
          JOIN pg_namespace n ON n.oid = t.typnamespace
          WHERE n.nspname = 'public'
          ORDER BY t.typname, e.enumsortorder
        `);
      const indexes = await client.query(`
          SELECT schemaname, tablename, indexname, indexdef
          FROM pg_indexes
          WHERE schemaname = 'public'
            AND tablename != 'node_schema_migrations'
            AND tablename != 'alembic_version'
          ORDER BY tablename, indexname
        `);
      const constraints = await client.query(`
          SELECT tc.table_name, tc.constraint_name, tc.constraint_type,
                 kcu.column_name, ccu.table_name AS foreign_table_name,
                 ccu.column_name AS foreign_column_name
          FROM information_schema.table_constraints tc
          LEFT JOIN information_schema.key_column_usage kcu
            ON tc.constraint_name = kcu.constraint_name
           AND tc.table_schema = kcu.table_schema
          LEFT JOIN information_schema.constraint_column_usage ccu
            ON tc.constraint_name = ccu.constraint_name
           AND tc.table_schema = ccu.table_schema
          WHERE tc.table_schema = 'public'
            AND tc.table_name != 'node_schema_migrations'
            AND tc.table_name != 'alembic_version'
            AND NOT (
              tc.constraint_type = 'CHECK'
              AND tc.constraint_name ~ '^[0-9]+_[0-9]+_[0-9]+_not_null$'
            )
          ORDER BY tc.table_name, tc.constraint_name, kcu.ordinal_position
        `);
      return {
        columns: columns.rows,
        enums: enums.rows,
        indexes: indexes.rows,
        constraints: constraints.rows
      };
    } finally {
      client.release();
    }
  } finally {
    await pool.end();
  }
};

const stable = (value: unknown): string => JSON.stringify(value);

const diffSection = (
  name: keyof Snapshot,
  alembic: Snapshot,
  node: Snapshot
): Array<Record<string, unknown>> => {
  const left = new Set(alembic[name].map(stable));
  const right = new Set(node[name].map(stable));
  const missing_from_node = alembic[name].filter((row) => !right.has(stable(row)));
  const extra_in_node = node[name].filter((row) => !left.has(stable(row)));
  return missing_from_node.length === 0 && extra_in_node.length === 0
    ? []
    : [
        {
          section: name,
          missing_from_node: missing_from_node.slice(0, 25),
          extra_in_node: extra_in_node.slice(0, 25),
          missing_count: missing_from_node.length,
          extra_count: extra_in_node.length
        }
      ];
};

const main = async (): Promise<void> => {
  const alembic = await snapshot(required("ALEMBIC_DATABASE_URL"));
  const node = await snapshot(required("NODE_DATABASE_URL"));
  const diffs = (
    ["columns", "enums", "indexes", "constraints"] as Array<keyof Snapshot>
  ).flatMap((section) => diffSection(section, alembic, node));

  if (diffs.length > 0) {
    console.error(
      JSON.stringify(
        {
          status: "schema_mismatch",
          diffs
        },
        null,
        2
      )
    );
    process.exitCode = 1;
    return;
  }

  console.log(JSON.stringify({ status: "schema_match" }, null, 2));
};

main().catch((error: unknown) => {
  console.error(
    JSON.stringify(
      {
        status: "schema_compare_failed",
        detail: error instanceof Error ? error.message : String(error)
      },
      null,
      2
    )
  );
  process.exitCode = 1;
});
