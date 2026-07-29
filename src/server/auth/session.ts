import crypto from "crypto";
import { and, eq, gt, lt } from "drizzle-orm";
import { db } from "@/server/db";
import { sessions, users } from "@/server/db/schema";

export const SESSION_COOKIE = "sid";
const SESSION_TTL_DAYS = 30;

export type SessionUser = {
  id: number;
  username: string;
  displayName: string;
  email: string | null;
  role: "admin" | "manager" | "technician" | "requester";
  /** Forces /change-password before anything else (admin-set passwords). */
  mustChangePassword: boolean;
};

function hashToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

/** Creates a session row and returns the raw token for the cookie. */
export async function createSession(userId: number): Promise<{
  token: string;
  expiresAt: Date;
}> {
  const token = crypto.randomBytes(32).toString("base64url");
  const expiresAt = new Date(
    Date.now() + SESSION_TTL_DAYS * 24 * 60 * 60 * 1000,
  );
  await db.insert(sessions).values({
    tokenHash: hashToken(token),
    userId,
    expiresAt,
  });
  return { token, expiresAt };
}

/**
 * Resolves a raw cookie token to its user. The JOIN enforces
 * `users.is_active`: deactivating a user invalidates their live sessions
 * immediately — deactivation is the offboarding mechanism (DECISIONS.md #3).
 */
export async function getUserBySessionToken(
  token: string,
): Promise<SessionUser | null> {
  const rows = await db
    .select({
      id: users.id,
      username: users.username,
      displayName: users.displayName,
      email: users.email,
      role: users.role,
      mustChangePassword: users.mustChangePassword,
    })
    .from(sessions)
    .innerJoin(users, eq(sessions.userId, users.id))
    .where(
      and(
        eq(sessions.tokenHash, hashToken(token)),
        gt(sessions.expiresAt, new Date()),
        eq(users.isActive, true),
      ),
    )
    .limit(1);
  return rows[0] ?? null;
}

export async function destroySession(token: string): Promise<void> {
  await db.delete(sessions).where(eq(sessions.tokenHash, hashToken(token)));
}

/** Purge expired sessions (called by the worker's housekeeping job). */
export async function purgeExpiredSessions(): Promise<void> {
  await db.delete(sessions).where(lt(sessions.expiresAt, new Date()));
}
