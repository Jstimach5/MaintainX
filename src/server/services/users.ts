import { and, asc, eq, ne, sql } from "drizzle-orm";
import { db } from "@/server/db";
import { orgSettings, sessions, users } from "@/server/db/schema";
import { hashPassword } from "@/server/auth/password";
import { recordAudit } from "./audit";
import type { Role } from "@/server/auth/guards";

export class ServiceError extends Error {}

export async function listUsers() {
  return db.select().from(users).orderBy(asc(users.displayName));
}

export async function getUser(id: number) {
  const rows = await db.select().from(users).where(eq(users.id, id)).limit(1);
  return rows[0] ?? null;
}

async function assertUsernameFree(username: string, exceptId?: number) {
  const clash = await db
    .select({ id: users.id })
    .from(users)
    .where(
      exceptId === undefined
        ? sql`lower(${users.username}) = lower(${username})`
        : and(
            sql`lower(${users.username}) = lower(${username})`,
            ne(users.id, exceptId),
          ),
    )
    .limit(1);
  if (clash.length > 0) {
    throw new ServiceError(`Username "${username}" is already taken.`);
  }
}

/**
 * First-run setup: creates org settings and the first administrator in one
 * transaction. Refuses if any user already exists (the /setup page is a
 * one-time door — see guards.isSetupMode).
 */
export async function setupOrganization(input: {
  orgName: string;
  timezone: string;
  username: string;
  displayName: string;
  password: string;
}): Promise<number> {
  return db.transaction(async (tx) => {
    const count = await tx
      .select({ count: sql<number>`count(*)::int` })
      .from(users);
    if ((count[0]?.count ?? 0) > 0) {
      throw new ServiceError("Setup has already been completed.");
    }
    await tx
      .insert(orgSettings)
      .values({ id: 1, name: input.orgName, timezone: input.timezone })
      .onConflictDoUpdate({
        target: orgSettings.id,
        set: { name: input.orgName, timezone: input.timezone },
      });
    const passwordHash = await hashPassword(input.password);
    const [admin] = await tx
      .insert(users)
      .values({
        username: input.username,
        passwordHash,
        displayName: input.displayName,
        role: "admin",
      })
      .returning({ id: users.id });
    await recordAudit(tx, {
      userId: admin.id,
      action: "org.setup",
      entityType: "org",
      entityId: 1,
      summary: `Organization "${input.orgName}" initialized; first admin "${input.username}" created`,
      source: "web",
    });
    return admin.id;
  });
}

export async function createUser(
  actorId: number,
  input: {
    username: string;
    displayName: string;
    email?: string | null;
    role: Role;
    password: string;
  },
): Promise<number> {
  await assertUsernameFree(input.username);
  const passwordHash = await hashPassword(input.password);
  return db.transaction(async (tx) => {
    const [row] = await tx
      .insert(users)
      .values({
        username: input.username,
        passwordHash,
        displayName: input.displayName,
        email: input.email || null,
        role: input.role,
        // Admin-typed passwords are temporary by definition.
        mustChangePassword: true,
      })
      .returning({ id: users.id });
    await recordAudit(tx, {
      userId: actorId,
      action: "user.create",
      entityType: "user",
      entityId: row.id,
      summary: `Created user "${input.username}" (${input.role})`,
      newValue: { username: input.username, role: input.role },
    });
    return row.id;
  });
}

export async function updateUser(
  actorId: number,
  userId: number,
  input: {
    displayName: string;
    email?: string | null;
    role: Role;
  },
): Promise<void> {
  const existing = await getUser(userId);
  if (!existing) throw new ServiceError("User not found.");

  // Guard: never demote the last active admin.
  if (existing.role === "admin" && input.role !== "admin") {
    await assertNotLastActiveAdmin(userId, "change the role of");
  }

  await db.transaction(async (tx) => {
    await tx
      .update(users)
      .set({
        displayName: input.displayName,
        email: input.email || null,
        role: input.role,
        updatedAt: new Date(),
      })
      .where(eq(users.id, userId));
    await recordAudit(tx, {
      userId: actorId,
      action: "user.update",
      entityType: "user",
      entityId: userId,
      summary: `Updated user "${existing.username}"`,
      previousValue: {
        displayName: existing.displayName,
        email: existing.email,
        role: existing.role,
      },
      newValue: input,
    });
  });
}

/** Password reset also revokes every live session for that user. */
export async function resetPassword(
  actorId: number,
  userId: number,
  newPassword: string,
): Promise<void> {
  const existing = await getUser(userId);
  if (!existing) throw new ServiceError("User not found.");
  const passwordHash = await hashPassword(newPassword);
  await db.transaction(async (tx) => {
    await tx
      .update(users)
      .set({ passwordHash, mustChangePassword: true, updatedAt: new Date() })
      .where(eq(users.id, userId));
    await tx.delete(sessions).where(eq(sessions.userId, userId));
    await recordAudit(tx, {
      userId: actorId,
      action: "user.password_reset",
      entityType: "user",
      entityId: userId,
      summary: `Password reset for "${existing.username}" (all sessions revoked)`,
    });
  });
}

async function assertNotLastActiveAdmin(userId: number, verb: string) {
  const admins = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(users)
    .where(
      and(eq(users.role, "admin"), eq(users.isActive, true), ne(users.id, userId)),
    );
  if ((admins[0]?.count ?? 0) === 0) {
    throw new ServiceError(
      `Cannot ${verb} the last active administrator.`,
    );
  }
}

/**
 * Deactivation is the offboarding mechanism: flips is_active AND deletes the
 * user's sessions in the same transaction, so a departed employee's phone is
 * signed out immediately (DECISIONS.md #3).
 */
export async function setUserActive(
  actorId: number,
  userId: number,
  active: boolean,
): Promise<void> {
  const existing = await getUser(userId);
  if (!existing) throw new ServiceError("User not found.");
  if (!active && existing.role === "admin") {
    await assertNotLastActiveAdmin(userId, "deactivate");
  }
  await db.transaction(async (tx) => {
    await tx
      .update(users)
      .set({ isActive: active, updatedAt: new Date() })
      .where(eq(users.id, userId));
    if (!active) {
      await tx.delete(sessions).where(eq(sessions.userId, userId));
    }
    await recordAudit(tx, {
      userId: actorId,
      action: active ? "user.reactivate" : "user.deactivate",
      entityType: "user",
      entityId: userId,
      summary: `${active ? "Reactivated" : "Deactivated"} user "${existing.username}"${active ? "" : " (all sessions revoked)"}`,
    });
  });
}
