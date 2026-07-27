"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { assertRole, AuthError } from "@/server/auth/guards";
import { ServiceError } from "@/server/services/users";
import { createPlan, runPmTick, updatePlan } from "@/server/services/pm";
import type { ActionResult } from "@/components/forms";

function friendly(err: unknown): ActionResult {
  if (err instanceof ServiceError || err instanceof AuthError) {
    return { error: err.message };
  }
  throw err;
}

const optionalId = z
  .union([z.literal(""), z.coerce.number().int().positive()])
  .optional()
  .transform((v) => (v === "" || v === undefined ? null : v));

const optionalMinutes = z
  .union([z.literal(""), z.coerce.number().int().min(0).max(100000)])
  .optional()
  .transform((v) => (v === "" || v === undefined ? null : v));

const planSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(300),
  description: z.string().trim().max(10000).optional(),
  siteId: z.coerce.number().int().positive("Site is required"),
  locationId: optionalId,
  assetId: optionalId,
  assignedTeamId: optionalId,
  procedureTemplateId: optionalId,
  priority: z.enum(["none", "low", "medium", "high", "critical"]),
  estimatedMinutes: optionalMinutes,
  plannedDowntimeMinutes: optionalMinutes,
  basis: z.enum(["fixed", "floating"]),
  recurUnit: z.enum(["day", "week", "month", "year"]),
  recurInterval: z.coerce.number().int().min(1).max(365),
  leadDays: z.coerce.number().int().min(0).max(365),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Start date is required"),
  endDate: z.string().optional(),
  isPaused: z.enum(["true", "false"]).default("false"),
});

function assignees(formData: FormData): number[] {
  return formData
    .getAll("assigneeIds")
    .map((v) => Number(v))
    .filter((n) => Number.isInteger(n) && n > 0);
}

export async function createPlanAction(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const actor = await assertRole("admin", "manager").catch(() => null);
  if (!actor) return { error: "Not allowed." };
  const parsed = planSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }
  let id: number;
  try {
    id = await createPlan(actor.id, {
      ...parsed.data,
      endDate: parsed.data.endDate || null,
      isPaused: parsed.data.isPaused === "true",
      assigneeIds: assignees(formData),
    });
  } catch (err) {
    return friendly(err);
  }
  revalidatePath("/pm-plans");
  redirect(`/pm-plans/${id}`);
}

const planUpdateSchema = planSchema.extend({
  planId: z.coerce.number().int().positive(),
  nextDue: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

export async function updatePlanAction(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const actor = await assertRole("admin", "manager").catch(() => null);
  if (!actor) return { error: "Not allowed." };
  const parsed = planUpdateSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }
  const { planId, ...rest } = parsed.data;
  try {
    await updatePlan(actor.id, planId, {
      ...rest,
      endDate: rest.endDate || null,
      isPaused: rest.isPaused === "true",
      assigneeIds: assignees(formData),
    });
  } catch (err) {
    return friendly(err);
  }
  revalidatePath(`/pm-plans/${planId}`);
  revalidatePath("/pm-plans");
  redirect(`/pm-plans/${planId}`);
}

/** Manual scheduler run — handy for admins and the e2e suite (§9). */
export async function runSchedulerAction(): Promise<void> {
  await assertRole("admin", "manager");
  await runPmTick();
  revalidatePath("/pm-plans");
  revalidatePath("/work-orders");
}
