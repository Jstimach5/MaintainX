"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { sql } from "drizzle-orm";
import { db } from "@/server/db";
import { users } from "@/server/db/schema";
import { verifyPassword } from "@/server/auth/password";
import {
  SESSION_COOKIE,
  createSession,
  destroySession,
} from "@/server/auth/session";
import type { ActionResult } from "@/components/forms";

/**
 * Simple in-memory login throttle: 5 consecutive failures for a username →
 * 60s delay. Single-process deployment makes this sufficient; the goal is
 * slowing credential guessing on the LAN, not internet-grade rate limiting
 * (the app is not internet-exposed — see docs/DEPLOYMENT.md).
 */
const failures = new Map<string, { count: number; lockedUntil: number }>();
const MAX_FAILS = 5;
const LOCK_MS = 60_000;

const loginSchema = z.object({
  username: z.string().trim().min(1, "Username is required"),
  password: z.string().min(1, "Password is required"),
  next: z.string().optional(),
});

export async function loginAction(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const parsed = loginSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }
  const { username, password } = parsed.data;
  const key = username.toLowerCase();

  const entry = failures.get(key);
  if (entry && entry.lockedUntil > Date.now()) {
    return {
      error: "Too many failed attempts. Wait a minute and try again.",
    };
  }

  const rows = await db
    .select()
    .from(users)
    .where(sql`lower(${users.username}) = ${key}`)
    .limit(1);
  const user = rows[0];

  const ok =
    user !== undefined &&
    user.isActive &&
    (await verifyPassword(password, user.passwordHash));

  if (!ok) {
    const next = { count: (entry?.count ?? 0) + 1, lockedUntil: 0 };
    if (next.count >= MAX_FAILS) {
      next.lockedUntil = Date.now() + LOCK_MS;
      next.count = 0;
    }
    failures.set(key, next);
    return { error: "Wrong username or password." };
  }

  failures.delete(key);
  const { token, expiresAt } = await createSession(user.id);
  const store = await cookies();
  store.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    expires: expiresAt,
    secure: process.env.NODE_ENV === "production" && !!process.env.COOKIE_SECURE,
  });

  // Only allow internal relative redirect targets.
  const next = parsed.data.next;
  const target = next && next.startsWith("/") && !next.startsWith("//") ? next : "/dashboard";
  redirect(target);
}

export async function logoutAction(): Promise<void> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (token) {
    await destroySession(token);
    store.delete(SESSION_COOKIE);
  }
  redirect("/login");
}
