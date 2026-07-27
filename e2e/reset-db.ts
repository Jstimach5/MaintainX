import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";

const ADMIN_URL =
  process.env.E2E_ADMIN_DATABASE_URL ??
  "postgres://cmms:cmms_dev_password@localhost:5432/cmms_dev";
const E2E_DB = "cmms_e2e";
const E2E_URL =
  process.env.E2E_DATABASE_URL ??
  `postgres://cmms:cmms_dev_password@localhost:5432/${E2E_DB}`;

/**
 * Resets the dedicated e2e database to a clean, fully-migrated state.
 * Runs as the first step of the `e2e:server` script — Playwright's webServer
 * starts BEFORE globalSetup would run, so the reset must happen inside the
 * server command, not in a Playwright globalSetup hook.
 */
async function resetDatabase() {
  const admin = new Pool({ connectionString: ADMIN_URL, max: 1 });
  const exists = await admin.query(
    "SELECT 1 FROM pg_database WHERE datname = $1",
    [E2E_DB],
  );
  if (exists.rowCount === 0) {
    await admin.query(`CREATE DATABASE ${E2E_DB}`);
  }
  await admin.end();

  const pool = new Pool({ connectionString: E2E_URL, max: 1 });
  await pool.query("DROP SCHEMA IF EXISTS public CASCADE");
  await pool.query("DROP SCHEMA IF EXISTS drizzle CASCADE");
  await pool.query("DROP SCHEMA IF EXISTS pgboss CASCADE");
  await pool.query("CREATE SCHEMA public");
  const db = drizzle(pool);
  await migrate(db, { migrationsFolder: "./drizzle" });
  await pool.end();
}

resetDatabase()
  .then(() => {
    console.log("[e2e] database reset complete");
  })
  .catch((err) => {
    console.error("[e2e] database reset failed:", err);
    process.exit(1);
  });
