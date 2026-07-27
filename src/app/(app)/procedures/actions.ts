"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { assertRole, AuthError } from "@/server/auth/guards";
import { ServiceError } from "@/server/services/users";
import {
  attachProcedure,
  createTemplate,
  respondToStep,
  saveTemplateVersion,
  stepsSchema,
} from "@/server/services/procedures";
import type { ActionResult } from "@/components/forms";

function friendly(err: unknown): ActionResult {
  if (err instanceof ServiceError || err instanceof AuthError) {
    return { error: err.message };
  }
  if (err instanceof z.ZodError) {
    return { error: err.issues[0]?.message ?? "Invalid procedure definition" };
  }
  throw err;
}

const templateMeta = z.object({
  name: z.string().trim().min(1, "Name is required").max(200),
  description: z.string().trim().max(5000).optional(),
  stepsJson: z.string().min(2, "Add at least one step"),
});

function parseSteps(stepsJson: string) {
  let raw: unknown;
  try {
    raw = JSON.parse(stepsJson);
  } catch {
    throw new ServiceError("Invalid step data.");
  }
  return stepsSchema.parse(raw);
}

export async function createTemplateAction(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const actor = await assertRole("admin", "manager").catch(() => null);
  if (!actor) return { error: "Not allowed." };
  const parsed = templateMeta.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }
  let id: number;
  try {
    id = await createTemplate(actor.id, {
      name: parsed.data.name,
      description: parsed.data.description,
      steps: parseSteps(parsed.data.stepsJson),
    });
  } catch (err) {
    return friendly(err);
  }
  revalidatePath("/procedures");
  redirect(`/procedures/${id}`);
}

const templateUpdateMeta = templateMeta.extend({
  templateId: z.coerce.number().int().positive(),
  isActive: z.enum(["true", "false"]),
});

export async function saveTemplateAction(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const actor = await assertRole("admin", "manager").catch(() => null);
  if (!actor) return { error: "Not allowed." };
  const parsed = templateUpdateMeta.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }
  try {
    await saveTemplateVersion(actor.id, parsed.data.templateId, {
      name: parsed.data.name,
      description: parsed.data.description,
      isActive: parsed.data.isActive === "true",
      steps: parseSteps(parsed.data.stepsJson),
    });
  } catch (err) {
    return friendly(err);
  }
  revalidatePath("/procedures");
  redirect(`/procedures/${parsed.data.templateId}`);
}

const attachSchema = z.object({
  workOrderId: z.coerce.number().int().positive(),
  templateId: z.coerce.number().int().positive("Choose a procedure"),
});

export async function attachProcedureAction(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const actor = await assertRole("admin", "manager").catch(() => null);
  if (!actor) return { error: "Not allowed." };
  const parsed = attachSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }
  try {
    await attachProcedure(actor.id, parsed.data.workOrderId, parsed.data.templateId);
  } catch (err) {
    return friendly(err);
  }
  revalidatePath(`/work-orders/${parsed.data.workOrderId}`);
  redirect(`/work-orders/${parsed.data.workOrderId}`);
}

const respondSchema = z.object({
  instanceId: z.coerce.number().int().positive(),
  stepIndex: z.coerce.number().int().min(0),
  workOrderId: z.coerce.number().int().positive(),
  kind: z.enum(["checkbox", "pass_fail", "multiple_choice", "text", "number", "meter_reading", "signature", "datetime", "photo", "file"]),
  value: z.string().optional(),
  comment: z.string().trim().max(2000).optional(),
});

export async function respondStepAction(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const actor = await assertRole("admin", "manager", "technician").catch(
    () => null,
  );
  if (!actor) return { error: "Not allowed." };
  const parsed = respondSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }
  const { instanceId, stepIndex, workOrderId, kind, value, comment } = parsed.data;
  let v: string | number | boolean;
  switch (kind) {
    case "checkbox":
      v = value === "true";
      break;
    case "number":
    case "meter_reading":
      v = Number(value);
      break;
    case "photo":
    case "file":
      v = "provided";
      break;
    default:
      v = value ?? "";
  }
  try {
    await respondToStep(actor, instanceId, stepIndex, { v, comment });
  } catch (err) {
    return friendly(err);
  }
  revalidatePath(`/work-orders/${workOrderId}`);
  redirect(`/work-orders/${workOrderId}`);
}
