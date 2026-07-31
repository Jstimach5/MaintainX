"use server";

import { cookies } from "next/headers";
import { updateTag } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { setupOrganization, ServiceError } from "@/server/services/users";
import { ORG_SETTINGS_TAG } from "@/server/services/org";
import { SESSION_COOKIE, createSession } from "@/server/auth/session";
import type { ActionResult } from "@/components/forms";

const setupSchema = z
  .object({
    orgName: z.string().trim().min(1, "Organization name is required").max(200),
    timezone: z.string().refine(
      (tz) => {
        try {
          new Intl.DateTimeFormat("en-US", { timeZone: tz });
          return true;
        } catch {
          return false;
        }
      },
      { message: "Unknown timezone" },
    ),
    username: z
      .string()
      .trim()
      .min(2, "Username must be at least 2 characters")
      .max(50)
      .regex(/^[a-zA-Z0-9._-]+$/, "Letters, numbers, dot, dash, underscore only"),
    displayName: z.string().trim().min(1, "Display name is required").max(200),
    password: z.string().min(8, "Password must be at least 8 characters"),
    passwordConfirm: z.string(),
  })
  .refine((d) => d.password === d.passwordConfirm, {
    message: "Passwords do not match",
    path: ["passwordConfirm"],
  });

export async function setupAction(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const parsed = setupSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }
  let adminId: number;
  try {
    adminId = await setupOrganization(parsed.data);
  } catch (err) {
    if (err instanceof ServiceError) return { error: err.message };
    throw err;
  }
  // First-run named the organization; the pre-setup fallback title is now
  // stale in the metadata cache.
  updateTag(ORG_SETTINGS_TAG);
  const { token, expiresAt } = await createSession(adminId);
  const store = await cookies();
  store.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    expires: expiresAt,
  });
  redirect("/dashboard");
}
