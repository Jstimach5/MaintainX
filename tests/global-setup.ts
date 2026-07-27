import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";

export const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ??
  "postgres://cmms:cmms_dev_password@localhost:5432/cmms_test";

/**
 * Vitest global setup: reset the test database to a clean, fully-migrated
 * state once per test run. Individual test files truncate the tables they
 * touch (fileParallelism is off, so files never race).
 */
export default async function globalSetup() {
  const pool = new Pool({ connectionString: TEST_DATABASE_URL, max: 1 });
  await pool.query("DROP SCHEMA IF EXISTS public CASCADE");
  await pool.query("DROP SCHEMA IF EXISTS drizzle CASCADE");
  await pool.query("CREATE SCHEMA public");
  const db = drizzle(pool);
  await migrate(db, { migrationsFolder: "./drizzle" });
  await pool.end();
}
