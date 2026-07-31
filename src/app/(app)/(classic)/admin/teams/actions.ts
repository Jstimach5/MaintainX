"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { assertRole, AuthError } from "@/server/auth/guards";
import { ServiceError } from "@/server/services/users";
import { createTeam, updateTeam } from "@/server/services/teams";
import type { ActionResult } from "@/components/forms";

const createSchema = z.object({
  name: z.string().trim().min(1, "Team name is required").max(200),
  description: z.string().trim().max(2000).optional(),
});

export async function createTeamAction(
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
    await createTeam(actor.id, parsed.data);
  } catch (err) {
    if (err instanceof ServiceError || err instanceof AuthError) {
      return { error: err.message };
    }
    throw err;
  }
  revalidatePath("/admin/teams");
  redirect("/admin/teams");
}

const updateSchema = z.object({
  teamId: z.coerce.number().int().positive(),
  name: z.string().trim().min(1, "Team name is required").max(200),
  description: z.string().trim().max(2000).optional(),
  isActive: z.enum(["true", "false"]),
});

export async function updateTeamAction(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const actor = await assertRole("admin").catch(() => null);
  if (!actor) return { error: "Not allowed." };
  const parsed = updateSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }
  const memberIds = formData
    .getAll("memberIds")
    .map((v) => Number(v))
    .filter((n) => Number.isInteger(n) && n > 0);
  try {
    await updateTeam(actor.id, parsed.data.teamId, {
      name: parsed.data.name,
      description: parsed.data.description,
      isActive: parsed.data.isActive === "true",
      memberIds,
    });
  } catch (err) {
    if (err instanceof ServiceError || err instanceof AuthError) {
      return { error: err.message };
    }
    throw err;
  }
  revalidatePath("/admin/teams");
  redirect("/admin/teams");
}
