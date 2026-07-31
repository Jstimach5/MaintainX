"use server";

import { redirect } from "next/navigation";
import { revalidatePath, updateTag } from "next/cache";
import { z } from "zod";
import { assertRole, AuthError } from "@/server/auth/guards";
import { ServiceError } from "@/server/services/users";
import { ORG_SETTINGS_TAG, updateOrgSettings } from "@/server/services/org";
import type { ActionResult } from "@/components/forms";

const schema = z.object({
  name: z.string().trim().min(1, "Organization name is required").max(200),
  timezone: z.string().min(1, "Choose a timezone"),
  // Checkbox: present ("on") when ticked, absent otherwise.
  requireCompletionApproval: z.string().optional(),
});

export async function updateSettingsAction(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const actor = await assertRole("admin").catch(() => null);
  if (!actor) return { error: "Not allowed." };
  const parsed = schema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }
  try {
    await updateOrgSettings(actor.id, {
      name: parsed.data.name,
      timezone: parsed.data.timezone,
      requireCompletionApproval: parsed.data.requireCompletionApproval != null,
    });
  } catch (err) {
    if (err instanceof ServiceError || err instanceof AuthError) {
      return { error: err.message };
    }
    throw err;
  }
  // The org name is baked into root metadata through a tagged cross-request
  // cache; without this the tab title keeps the old name until redeploy.
  // `updateTag` (not `revalidateTag`) so the admin who just renamed the
  // organization sees the new name on the very next render.
  updateTag(ORG_SETTINGS_TAG);
  revalidatePath("/", "layout");
  redirect("/admin/settings?saved=1");
}
