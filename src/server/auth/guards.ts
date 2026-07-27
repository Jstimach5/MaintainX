import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { sql } from "drizzle-orm";
import { db } from "@/server/db";
import { users } from "@/server/db/schema";
import {
  SESSION_COOKIE,
  getUserBySessionToken,
  type SessionUser,
} from "./session";

export type Role = SessionUser["role"];

/**
 * Role hierarchy for coarse checks. Higher includes nothing automatically —
 * checks are explicit lists — but ordering is useful for UI decisions.
 */
export const ALL_ROLES: Role[] = [
  "admin",
  "manager",
  "technician",
  "requester",
];

/** Request-scoped current-user lookup (deduped via React cache). */
export const getCurrentUser = cache(async (): Promise<SessionUser | null> => {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  return getUserBySessionToken(token);
});

/** True while no users exist — the app is in first-run setup mode. */
export const isSetupMode = cache(async (): Promise<boolean> => {
  const rows = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(users);
  return (rows[0]?.count ?? 0) === 0;
});

/**
 * Page guard: redirects to /setup (first run) or /login when unauthenticated.
 * Use in server components / pages.
 */
export async function requireUser(): Promise<SessionUser> {
  const user = await getCurrentUser();
  if (!user) {
    if (await isSetupMode()) redirect("/setup");
    redirect("/login");
  }
  return user;
}

/** Page guard: requires one of the given roles; otherwise renders 403. */
export async function requireRole(...roles: Role[]): Promise<SessionUser> {
  const user = await requireUser();
  if (!roles.includes(user.role)) {
    redirect("/forbidden");
  }
  return user;
}

/**
 * Action guard for server actions and route handlers: throws instead of
 * redirecting so mutations fail closed. EVERY mutation must call this (or
 * assertUser) — hiding a button is not security (§4).
 */
export class AuthError extends Error {
  status: 401 | 403;
  constructor(message: string, status: 401 | 403) {
    super(message);
    this.status = status;
  }
}

export async function assertUser(): Promise<SessionUser> {
  const user = await getCurrentUser();
  if (!user) throw new AuthError("Not signed in", 401);
  return user;
}

export async function assertRole(...roles: Role[]): Promise<SessionUser> {
  const user = await assertUser();
  if (!roles.includes(user.role)) {
    throw new AuthError(
      `Requires role: ${roles.join(" or ")} (you are ${user.role})`,
      403,
    );
  }
  return user;
}
