import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Pool } from "pg";

/**
 * Applies all pending SQL migrations from ./drizzle to the database at
 * DATABASE_URL. Safe to run repeatedly; already-applied migrations are
 * skipped. Run with: npm run db:migrate
 */
async function main() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    console.error("DATABASE_URL is not set. Copy .env.example to .env first.");
    process.exit(1);
  }
  const pool = new Pool({ connectionString, max: 1 });
  const db = drizzle(pool);
  console.log("Applying migrations…");
  await migrate(db, { migrationsFolder: "./drizzle" });
  await pool.end();
  console.log("Migrations complete.");
}

main().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
