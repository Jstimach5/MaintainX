"use server";

import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { acceptInvitation } from "@/server/services/invitations";
import { ServiceError } from "@/server/services/users";
import { createSession, SESSION_COOKIE } from "@/server/auth/session";
import { makeThrottle } from "@/lib/throttle";
import type { ActionResult } from "@/components/forms";

/**
 * Acceptance is public and token-guessable in theory, so it is throttled
 * per client IP: 10 failed attempts → 5-minute lock. (Tokens are 256-bit
 * random, so guessing is not a practical risk; the throttle exists to
 * make that statement boring.)
 */
const throttle = makeThrottle(10, 5 * 60_000);

const acceptSchema = z
  .object({
    token: z.string().min(10).max(200),
    username: z.string().trim().min(3, "Pick a username (3+ characters)").max(50),
    displayName: z.string().trim().min(1, "Enter your name").max(200),
    password: z.string().min(8, "Password must be at least 8 characters").max(200),
    confirm: z.string(),
  })
  .refine((v) => v.password === v.confirm, {
    message: "The two passwords don't match.",
    path: ["confirm"],
  });

export async function acceptInvitationAction(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const hdrs = await headers();
  const ip =
    hdrs.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  const wait = throttle.check(ip);
  if (wait > 0) {
    return { error: `Too many attempts — try again in ${wait} seconds.` };
  }

  const parsed = acceptSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }
  let userId: number;
  try {
    ({ userId } = await acceptInvitation({
      token: parsed.data.token,
      username: parsed.data.username,
      displayName: parsed.data.displayName,
      password: parsed.data.password,
    }));
  } catch (err) {
    throttle.fail(ip);
    if (err instanceof ServiceError) return { error: err.message };
    throw err;
  }
  throttle.succeed(ip);

  const { token: sessionToken, expiresAt } = await createSession(userId);
  const store = await cookies();
  store.set(SESSION_COOKIE, sessionToken, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    expires: expiresAt,
    secure: process.env.NODE_ENV === "production" && !!process.env.COOKIE_SECURE,
  });
  redirect("/dashboard");
}
