import crypto from "node:crypto";
import { and, eq, isNull, sql } from "drizzle-orm";
import { db } from "@/server/db";
import { passwordResets, sessions, users } from "@/server/db/schema";
import { hashPassword } from "@/server/auth/password";
import { recordAudit } from "./audit";
import { ServiceError } from "./users";

const RESET_TTL_MS = 60 * 60_000; // 1 hour

function hashToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

/**
 * Start a reset for a username OR email. Deliberately returns the same
 * shape whether or not a matching account exists (enumeration-safe) — the
 * caller shows one generic confirmation either way. When a real active
 * user with an email matches, the raw token is returned for delivery and
 * prior unused tokens for that user die.
 */
export async function requestPasswordReset(usernameOrEmail: string): Promise<
  | { match: false }
  | { match: true; token: string; expiresAt: Date; userId: number; email: string; displayName: string }
> {
  const needle = usernameOrEmail.trim().toLowerCase();
  if (!needle) return { match: false };
  const [user] = await db
    .select()
    .from(users)
    .where(
      and(
        eq(users.isActive, true),
        sql`(lower(${users.username}) = ${needle} OR lower(coalesce(${users.email}, '')) = ${needle})`,
      ),
    )
    .limit(1);
  if (!user || !user.email) return { match: false };

  const token = crypto.randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + RESET_TTL_MS);
  await db.transaction(async (tx) => {
    // Newest link is the only live one.
    await tx
      .update(passwordResets)
      .set({ usedAt: new Date() })
      .where(and(eq(passwordResets.userId, user.id), isNull(passwordResets.usedAt)));
    await tx.insert(passwordResets).values({
      userId: user.id,
      tokenHash: hashToken(token),
      expiresAt,
    });
    await recordAudit(tx, {
      userId: user.id,
      action: "user.password_reset_requested",
      entityType: "user",
      entityId: user.id,
      summary: `Password reset requested for "${user.username}"`,
    });
  });
  return {
    match: true,
    token,
    expiresAt,
    userId: user.id,
    email: user.email,
    displayName: user.displayName,
  };
}

/** Token → user preview for the reset page (never reveals the hash). */
export async function getResetByToken(
  token: string,
): Promise<{ ok: true; username: string } | { ok: false }> {
  if (!token || token.length > 200) return { ok: false };
  const [row] = await db
    .select({ reset: passwordResets, username: users.username })
    .from(passwordResets)
    .innerJoin(users, eq(passwordResets.userId, users.id))
    .where(eq(passwordResets.tokenHash, hashToken(token)))
    .limit(1);
  if (!row || row.reset.usedAt || row.reset.expiresAt < new Date()) {
    return { ok: false };
  }
  return { ok: true, username: row.username };
}

/**
 * Complete a reset: one-shot consumption by conditional UPDATE, new
 * password, and **every session for the user revoked** — a reset is the
 * recovery path from a compromised password, so nothing survives it.
 */
export async function completePasswordReset(
  token: string,
  newPassword: string,
): Promise<void> {
  if (newPassword.length < 8) {
    throw new ServiceError("Password must be at least 8 characters.");
  }
  const [row] = await db
    .select()
    .from(passwordResets)
    .where(eq(passwordResets.tokenHash, hashToken(token)))
    .limit(1);
  if (!row || row.usedAt || row.expiresAt < new Date()) {
    throw new ServiceError(
      "This reset link is no longer valid — request a new one from the sign-in page.",
    );
  }
  const passwordHash = await hashPassword(newPassword);
  await db.transaction(async (tx) => {
    const consumed = await tx
      .update(passwordResets)
      .set({ usedAt: new Date() })
      .where(
        and(
          eq(passwordResets.id, row.id),
          isNull(passwordResets.usedAt),
          sql`${passwordResets.expiresAt} > now()`,
        ),
      )
      .returning({ id: passwordResets.id });
    if (consumed.length === 0) {
      throw new ServiceError("This reset link was already used.");
    }
    await tx
      .update(users)
      .set({ passwordHash, mustChangePassword: false, updatedAt: new Date() })
      .where(eq(users.id, row.userId));
    await tx.delete(sessions).where(eq(sessions.userId, row.userId));
    await recordAudit(tx, {
      userId: row.userId,
      action: "user.password_reset_completed",
      entityType: "user",
      entityId: row.userId,
      summary: "Password reset completed; all sessions revoked",
    });
  });
}

/**
 * Signed-in password change (also clears the first-login force flag).
 * Other sessions are revoked; the caller keeps the current one.
 */
export async function changeOwnPassword(
  userId: number,
  currentPassword: string,
  newPassword: string,
  keepSessionTokenHash?: string,
): Promise<void> {
  if (newPassword.length < 8) {
    throw new ServiceError("New password must be at least 8 characters.");
  }
  const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  if (!user) throw new ServiceError("Account not found.");
  const { verifyPassword } = await import("@/server/auth/password");
  if (!(await verifyPassword(currentPassword, user.passwordHash))) {
    throw new ServiceError("Current password is wrong.");
  }
  const passwordHash = await hashPassword(newPassword);
  await db.transaction(async (tx) => {
    await tx
      .update(users)
      .set({ passwordHash, mustChangePassword: false, updatedAt: new Date() })
      .where(eq(users.id, userId));
    if (keepSessionTokenHash) {
      await tx
        .delete(sessions)
        .where(
          and(
            eq(sessions.userId, userId),
            sql`${sessions.tokenHash} <> ${keepSessionTokenHash}`,
          ),
        );
    } else {
      await tx.delete(sessions).where(eq(sessions.userId, userId));
    }
    await recordAudit(tx, {
      userId,
      action: "user.password_changed",
      entityType: "user",
      entityId: userId,
      summary: "Password changed; other sessions revoked",
    });
  });
}
