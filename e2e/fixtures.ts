import { Pool } from "pg";
import { hashPassword } from "../src/server/auth/password";

export const E2E_DB_URL =
  process.env.E2E_DATABASE_URL ??
  "postgres://cmms:cmms_dev_password@localhost:5432/cmms_e2e";

export const CREDS = {
  admin: { username: "admin", password: "admin-password-123" },
  tech: { username: "tech1", password: "tech-password-123" },
  manager: { username: "mgr1", password: "mgr-password-123" },
  requester: { username: "req1", password: "req-password-123" },
} as const;

/**
 * Idempotently ensures org settings + one user per role exist in the e2e
 * database, so spec files don't depend on auth.spec.ts having run first.
 * (auth.spec.ts creates `admin`/`tech1` through the real UI; the ON CONFLICT
 * guards make both paths coexist.)
 */
export async function ensureBaseData(): Promise<void> {
  const pool = new Pool({ connectionString: E2E_DB_URL, max: 1 });
  try {
    await pool.query(
      `INSERT INTO org_settings (id, name, timezone)
       VALUES (1, 'Acme Maintenance', 'America/Chicago')
       ON CONFLICT (id) DO NOTHING`,
    );
    const roleFor = {
      admin: "admin",
      tech: "technician",
      manager: "manager",
      requester: "requester",
    } as const;
    for (const key of Object.keys(CREDS) as (keyof typeof CREDS)[]) {
      const { username, password } = CREDS[key];
      const hash = await hashPassword(password);
      await pool.query(
        `INSERT INTO users (username, password_hash, display_name, role)
         SELECT $1, $2, $3, $4::user_role
         WHERE NOT EXISTS (
           SELECT 1 FROM users WHERE lower(username) = lower($1)
         )`,
        [username, hash, `E2E ${key}`, roleFor[key]],
      );
    }
  } finally {
    await pool.end();
  }
}
