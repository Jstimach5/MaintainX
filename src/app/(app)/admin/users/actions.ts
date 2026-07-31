"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { assertRole, AuthError } from "@/server/auth/guards";
import {
  ServiceError,
  createUser,
  resetPassword,
  setUserActive,
  updateUser,
} from "@/server/services/users";
import type { ActionResult } from "@/components/forms";

const roleSchema = z.enum(["admin", "manager", "technician", "requester"]);

const createSchema = z.object({
  username: z
    .string()
    .trim()
    .min(2, "Username must be at least 2 characters")
    .max(50)
    .regex(/^[a-zA-Z0-9._-]+$/, "Letters, numbers, dot, dash, underscore only"),
  displayName: z.string().trim().min(1, "Display name is required").max(200),
  email: z.string().trim().email("Invalid email").max(320).or(z.literal("")),
  role: roleSchema,
  password: z.string().min(8, "Password must be at least 8 characters"),
});

function friendly(err: unknown): ActionResult {
  if (err instanceof ServiceError || err instanceof AuthError) {
    return { error: err.message };
  }
  throw err;
}

export async function createUserAction(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const actor = await assertRole("admin").catch(() => null);
  if (!actor) return { error: "Not allowed." };
  const parsed = createSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }
  try {
    await createUser(actor.id, parsed.data);
  } catch (err) {
    return friendly(err);
  }
  revalidatePath("/admin/users");
  redirect("/admin/users");
}

const updateSchema = z.object({
  userId: z.coerce.number().int().positive(),
  displayName: z.string().trim().min(1, "Display name is required").max(200),
  email: z.string().trim().email("Invalid email").max(320).or(z.literal("")),
  role: roleSchema,
});

export async function updateUserAction(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const actor = await assertRole("admin").catch(() => null);
  if (!actor) return { error: "Not allowed." };
  const parsed = updateSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }
  const { userId, ...rest } = parsed.data;
  try {
    await updateUser(actor.id, userId, rest);
  } catch (err) {
    return friendly(err);
  }
  revalidatePath("/admin/users");
  redirect("/admin/users");
}

const resetSchema = z.object({
  userId: z.coerce.number().int().positive(),
  password: z.string().min(8, "Password must be at least 8 characters"),
});

export async function resetPasswordAction(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const actor = await assertRole("admin").catch(() => null);
  if (!actor) return { error: "Not allowed." };
  const parsed = resetSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }
  try {
    await resetPassword(actor.id, parsed.data.userId, parsed.data.password);
  } catch (err) {
    return friendly(err);
  }
  revalidatePath("/admin/users");
  redirect("/admin/users");
}

const activeSchema = z.object({
  userId: z.coerce.number().int().positive(),
  active: z.enum(["true", "false"]),
});

export async function setActiveAction(formData: FormData): Promise<void> {
  const actor = await assertRole("admin");
  const parsed = activeSchema.parse(Object.fromEntries(formData));
  await setUserActive(actor.id, parsed.userId, parsed.active === "true");
  revalidatePath("/admin/users");
}
