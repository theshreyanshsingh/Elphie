import { Kysely, PostgresDialect } from "kysely";
import pg from "pg";
import { env } from "../config/env.js";
import type { Database } from "./types.js";

const { Pool } = pg;

export const createDb = (): Kysely<Database> =>
  new Kysely<Database>({
    dialect: new PostgresDialect({
      pool: new Pool({
        connectionString: env.databaseUrl
      })
    })
  });

export const db = createDb();
