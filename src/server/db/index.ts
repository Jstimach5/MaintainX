import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema";

/**
 * Single shared connection pool. Cached on globalThis so Next.js dev-mode
 * hot reloading does not open a new pool per reload.
 */
const globalForDb = globalThis as unknown as {
  cmmsPool?: Pool;
};

function createPool(): Pool {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL is not set");
  }
  return new Pool({ connectionString, max: 10 });
}

export const pool: Pool = globalForDb.cmmsPool ?? createPool();
if (process.env.NODE_ENV !== "production") {
  globalForDb.cmmsPool = pool;
}

export const db: NodePgDatabase<typeof schema> = drizzle(pool, { schema });

export type Db = typeof db;
export { schema };
