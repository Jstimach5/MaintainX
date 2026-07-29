"use server";

import { headers } from "next/headers";
import { z } from "zod";
import { requestPasswordReset } from "@/server/services/passwordReset";
import { emailConfigured, passwordResetEmail, sendEmail } from "@/server/email";
import { readOrgSettings } from "@/server/services/org";
import { makeThrottle } from "@/lib/throttle";

/** 5 requests per IP per 10 minutes — resets are not a bulk operation. */
const throttle = makeThrottle(5, 10 * 60_000);

export type ForgotResult = undefined | { done: boolean; error?: string };

const schema = z.object({ identifier: z.string().trim().min(1).max(300) });

export async function forgotPasswordAction(
  _prev: ForgotResult,
  formData: FormData,
): Promise<ForgotResult> {
  const hdrs = await headers();
  const ip = hdrs.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  const wait = throttle.check(ip);
  if (wait > 0) {
    return { done: false, error: `Too many attempts — try again in ${wait} seconds.` };
  }
  const parsed = schema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { done: false, error: "Enter your username or email." };
  }
  throttle.fail(ip); // count every request; success path is identical

  const result = await requestPasswordReset(parsed.data.identifier);
  // Identical outward behavior whether or not an account matched — the
  // page never confirms account existence. Delivery is best effort.
  if (result.match && emailConfigured()) {
    const org = await readOrgSettings();
    const msg = passwordResetEmail({
      orgName: org.name,
      displayName: result.displayName,
      token: result.token,
      expiresAt: result.expiresAt,
    });
    await sendEmail({ ...msg, to: result.email });
  }
  return { done: true };
}
