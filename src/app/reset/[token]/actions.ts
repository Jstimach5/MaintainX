"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { completePasswordReset } from "@/server/services/passwordReset";
import { ServiceError } from "@/server/services/users";
import { makeThrottle } from "@/lib/throttle";
import type { ActionResult } from "@/components/forms";

const throttle = makeThrottle(10, 5 * 60_000);

const schema = z
  .object({
    token: z.string().min(10).max(200),
    password: z.string().min(8, "Password must be at least 8 characters").max(200),
    confirm: z.string(),
  })
  .refine((v) => v.password === v.confirm, {
    message: "The two passwords don't match.",
    path: ["confirm"],
  });

export async function resetPasswordAction(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const hdrs = await headers();
  const ip = hdrs.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  const wait = throttle.check(ip);
  if (wait > 0) {
    return { error: `Too many attempts — try again in ${wait} seconds.` };
  }
  const parsed = schema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }
  try {
    await completePasswordReset(parsed.data.token, parsed.data.password);
  } catch (err) {
    throttle.fail(ip);
    if (err instanceof ServiceError) return { error: err.message };
    throw err;
  }
  throttle.succeed(ip);
  redirect("/login?reset=1");
}
