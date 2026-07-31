import { expect, type Page } from "@playwright/test";
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

/**
 * Click a primary-nav destination, opening its disclosure group first.
 *
 * The desktop nav groups destinations behind toggle buttons, and role
 * filtering can collapse a one-item group back into a plain link — so try
 * the direct link first, then the group. Retries the toggle once: the
 * trigger is a client component, and a click landing before hydration is
 * dropped silently.
 */
const NAV_GROUP_OF: Record<string, string> = {
  Dashboard: "Work",
  Schedule: "Work",
  "Work orders": "Work",
  Reports: "Work",
  Meters: "Maintenance",
  PM: "Maintenance",
  Procedures: "Maintenance",
  Assets: "Assets",
  Sites: "Assets",
  Locations: "Assets",
  Imports: "Assets",
  Audit: "Assets",
  Users: "Admin",
  Teams: "Admin",
  Settings: "Admin",
};

export async function navTo(page: Page, label: string): Promise<void> {
  const banner = page.getByRole("banner");
  const exact = new RegExp(`^${label}$`, "i");
  const direct = banner.getByRole("link", { name: exact });
  if (await direct.isVisible().catch(() => false)) {
    await direct.click();
    return;
  }
  const group = NAV_GROUP_OF[label];
  if (!group) throw new Error(`navTo: no group known for "${label}"`);
  const trigger = banner.getByRole("button", { name: new RegExp(`^${group}$`, "i") });
  await trigger.click();
  if ((await trigger.getAttribute("aria-expanded")) !== "true") {
    await trigger.click(); // hydration race: the first click was dropped
  }
  await expect(trigger).toHaveAttribute("aria-expanded", "true");
  await banner.getByRole("link", { name: exact }).click();
}
