import { sql } from "drizzle-orm";
import { db } from "@/server/db";
import { users } from "@/server/db/schema";
import { hashPassword } from "@/server/auth/password";
import type { Role } from "@/server/auth/guards";

/** Truncate all app tables (restart identities), keeping the schema. */
export async function truncateAll() {
  await db.execute(sql`
    TRUNCATE TABLE
      audit_events, team_members, teams, sessions, users, org_settings
    RESTART IDENTITY CASCADE
  `);
}

let userCounter = 0;

export async function makeUser(input?: {
  role?: Role;
  username?: string;
  password?: string;
  isActive?: boolean;
}): Promise<{ id: number; username: string; password: string; role: Role }> {
  userCounter += 1;
  const username = input?.username ?? `user${userCounter}`;
  const password = input?.password ?? "password123";
  const role = input?.role ?? "technician";
  const [row] = await db
    .insert(users)
    .values({
      username,
      passwordHash: await hashPassword(password),
      displayName: `Test ${username}`,
      role,
      isActive: input?.isActive ?? true,
    })
    .returning({ id: users.id });
  return { id: row.id, username, password, role };
}
