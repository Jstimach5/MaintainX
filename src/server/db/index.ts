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

/**
 * The pool is created on FIRST USE, not at import. Next's build imports
 * this module while collecting page data, and a build machine (docker
 * image build, clean clone) legitimately has no DATABASE_URL — the clear
 * "DATABASE_URL is not set" error still fires, but at first query, where
 * it belongs.
 */
function getPool(): Pool {
  if (!globalForDb.cmmsPool) {
    globalForDb.cmmsPool = createPool();
  }
  return globalForDb.cmmsPool;
}

export const pool: Pool = new Proxy({} as Pool, {
  get(_target, prop) {
    const real = getPool();
    const value = Reflect.get(real, prop, real);
    return typeof value === "function" ? value.bind(real) : value;
  },
}) as Pool;

export const db: NodePgDatabase<typeof schema> = drizzle(pool, { schema });

export type Db = typeof db;
export { schema };
