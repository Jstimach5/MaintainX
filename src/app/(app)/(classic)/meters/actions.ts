"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { assertRole, AuthError } from "@/server/auth/guards";
import { ServiceError } from "@/server/services/users";
import {
  addReading,
  correctReading,
  createMeter,
  createTrigger,
  setTriggerActive,
  updateMeter,
} from "@/server/services/meters";
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

const optionalNum = z
  .union([z.literal(""), z.coerce.number()])
  .optional()
  .transform((v) => (v === "" || v === undefined ? null : v));

const meterSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(200),
  description: z.string().trim().max(5000).optional(),
  unit: z.string().trim().min(1, "Unit is required").max(50),
  assetId: optionalId,
  locationId: optionalId,
  mustIncrease: z.enum(["true", "false"]),
  warnThreshold: optionalNum,
  criticalThreshold: optionalNum,
  isActive: z.enum(["true", "false"]).default("true"),
});

export async function createMeterAction(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const actor = await assertRole("admin", "manager").catch(() => null);
  if (!actor) return { error: "Not allowed." };
  const parsed = meterSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }
  let id: number;
  try {
    id = await createMeter(actor.id, {
      ...parsed.data,
      mustIncrease: parsed.data.mustIncrease === "true",
      isActive: parsed.data.isActive === "true",
    });
  } catch (err) {
    return friendly(err);
  }
  revalidatePath("/meters");
  redirect(`/meters/${id}`);
}

const meterUpdateSchema = meterSchema.extend({
  meterId: z.coerce.number().int().positive(),
});

export async function updateMeterAction(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const actor = await assertRole("admin", "manager").catch(() => null);
  if (!actor) return { error: "Not allowed." };
  const parsed = meterUpdateSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }
  const { meterId, ...rest } = parsed.data;
  try {
    await updateMeter(actor.id, meterId, {
      ...rest,
      mustIncrease: rest.mustIncrease === "true",
      isActive: rest.isActive === "true",
    });
  } catch (err) {
    return friendly(err);
  }
  revalidatePath(`/meters/${meterId}`);
  return {};
}

const readingSchema = z.object({
  meterId: z.coerce.number().int().positive(),
  value: z.coerce.number(),
  note: z.string().trim().max(1000).optional(),
  isRollover: z.enum(["true"]).optional(),
});

export async function addReadingAction(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const actor = await assertRole("admin", "manager", "technician").catch(
    () => null,
  );
  if (!actor) return { error: "Not allowed." };
  const parsed = readingSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { error: "Enter a valid number for the reading." };
  }
  try {
    await addReading(actor, parsed.data.meterId, {
      value: parsed.data.value,
      note: parsed.data.note,
      isRollover: parsed.data.isRollover === "true",
    });
  } catch (err) {
    return friendly(err);
  }
  revalidatePath(`/meters/${parsed.data.meterId}`);
  return {};
}

const correctionSchema = z.object({
  meterId: z.coerce.number().int().positive(),
  readingId: z.coerce.number().int().positive(),
  value: z.coerce.number(),
  note: z.string().trim().min(1, "A correction note is required").max(1000),
});

export async function correctReadingAction(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const actor = await assertRole("admin", "manager").catch(() => null);
  if (!actor) return { error: "Not allowed." };
  const parsed = correctionSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }
  try {
    await correctReading(actor, parsed.data.readingId, {
      value: parsed.data.value,
      note: parsed.data.note,
    });
  } catch (err) {
    return friendly(err);
  }
  revalidatePath(`/meters/${parsed.data.meterId}`);
  return {};
}

const triggerSchema = z.object({
  meterId: z.coerce.number().int().positive(),
  name: z.string().trim().min(1, "Name is required").max(200),
  type: z.enum(["threshold", "interval"]),
  threshold: optionalNum,
  intervalValue: optionalNum,
  skipIfOpen: z.enum(["true", "false"]).default("true"),
  woTitle: z.string().trim().min(1, "Work-order title is required").max(300),
  woDescription: z.string().trim().max(5000).optional(),
  priority: z.enum(["none", "low", "medium", "high", "critical"]),
  procedureTemplateId: optionalId,
  assignedTeamId: optionalId,
});

export async function createTriggerAction(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const actor = await assertRole("admin", "manager").catch(() => null);
  if (!actor) return { error: "Not allowed." };
  const parsed = triggerSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }
  const { meterId, ...rest } = parsed.data;
  try {
    await createTrigger(actor.id, meterId, {
      ...rest,
      skipIfOpen: rest.skipIfOpen === "true",
    });
  } catch (err) {
    return friendly(err);
  }
  revalidatePath(`/meters/${meterId}`);
  return {};
}

const toggleSchema = z.object({
  meterId: z.coerce.number().int().positive(),
  triggerId: z.coerce.number().int().positive(),
  active: z.enum(["true", "false"]),
});

export async function toggleTriggerAction(formData: FormData): Promise<void> {
  const actor = await assertRole("admin", "manager");
  const parsed = toggleSchema.parse(Object.fromEntries(formData));
  await setTriggerActive(actor.id, parsed.triggerId, parsed.active === "true");
  revalidatePath(`/meters/${parsed.meterId}`);
}
