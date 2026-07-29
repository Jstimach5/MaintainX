"use server";

import crypto from "node:crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { assertUser } from "@/server/auth/guards";
import { SESSION_COOKIE } from "@/server/auth/session";
import { changeOwnPassword } from "@/server/services/passwordReset";
import { ServiceError } from "@/server/services/users";
import type { ActionResult } from "@/components/forms";

const schema = z
  .object({
    current: z.string().min(1, "Enter your current password"),
    password: z.string().min(8, "New password must be at least 8 characters").max(200),
    confirm: z.string(),
  })
  .refine((v) => v.password === v.confirm, {
    message: "The two passwords don't match.",
    path: ["confirm"],
  });

export async function changePasswordAction(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const user = await assertUser().catch(() => null);
  if (!user) return { error: "Sign in first." };
  const parsed = schema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }
  const store = await cookies();
  const raw = store.get(SESSION_COOKIE)?.value;
  const keepHash = raw
    ? crypto.createHash("sha256").update(raw).digest("hex")
    : undefined;
  try {
    await changeOwnPassword(
      user.id,
      parsed.data.current,
      parsed.data.password,
      keepHash,
    );
  } catch (err) {
    if (err instanceof ServiceError) return { error: err.message };
    throw err;
  }
  redirect("/dashboard");
}
