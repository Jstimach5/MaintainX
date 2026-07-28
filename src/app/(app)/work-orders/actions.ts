"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { assertRole, AuthError } from "@/server/auth/guards";
import { ServiceError } from "@/server/services/users";
import {
  addComment,
  addLabor,
  addPart,
  changeWorkOrderStatus,
  createWorkOrder,
  removePart,
  updateWorkOrder,
} from "@/server/services/workOrders";
import { addReading } from "@/server/services/meters";
import { getOrgSettings } from "@/server/services/org";
import { wallTimeToUtc } from "@/lib/format";
import type { ActionResult } from "@/components/forms";

async function toUtc(raw: string | undefined): Promise<Date | null> {
  if (!raw) return null;
  const org = await getOrgSettings();
  return wallTimeToUtc(raw, org.timezone);
}

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

// Raw datetime-local strings; converted to UTC in the action using the ORG
// timezone (wallTimeToUtc) — `new Date(str)` would misread them as
// server-zone time (DECISIONS.md #5).
const optionalDateTimeRaw = z.string().trim().optional();

const woSchema = z.object({
  title: z.string().trim().min(1, "Title is required").max(300),
  description: z.string().trim().max(10000).optional(),
  siteId: z.coerce.number().int().positive("Site is required"),
  locationId: optionalId,
  parentWorkOrderId: optionalId,
  workType: z.enum([
    "preventive",
    "reactive",
    "inspection",
    "corrective",
    "safety",
    "project",
    "other",
  ]),
  priority: z.enum(["none", "low", "medium", "high", "critical"]),
  assignedTeamId: optionalId,
  requesterId: optionalId,
  plannedStartAt: optionalDateTimeRaw,
  dueAt: optionalDateTimeRaw,
  estimatedMinutes: optionalMinutes,
  plannedDowntimeMinutes: optionalMinutes,
  tags: z.string().trim().max(500).optional(),
});

function parseMulti(formData: FormData, key: string): number[] {
  return formData
    .getAll(key)
    .map((v) => Number(v))
    .filter((n) => Number.isInteger(n) && n > 0);
}

function parseTags(raw: string | undefined): string[] {
  return (raw ?? "")
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean);
}

export async function createWorkOrderAction(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const actor = await assertRole("admin", "manager").catch(() => null);
  if (!actor) return { error: "Not allowed." };
  const parsed = woSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }
  let id: number;
  try {
    id = await createWorkOrder(actor.id, {
      ...parsed.data,
      plannedStartAt: await toUtc(parsed.data.plannedStartAt),
      dueAt: await toUtc(parsed.data.dueAt),
      tags: parseTags(parsed.data.tags),
      assetIds: parseMulti(formData, "assetIds"),
      assigneeIds: parseMulti(formData, "assigneeIds"),
    });
  } catch (err) {
    return friendly(err);
  }
  revalidatePath("/work-orders");
  redirect(`/work-orders/${id}`);
}

const woUpdateSchema = woSchema.extend({
  workOrderId: z.coerce.number().int().positive(),
});

export async function updateWorkOrderAction(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const actor = await assertRole("admin", "manager").catch(() => null);
  if (!actor) return { error: "Not allowed." };
  const parsed = woUpdateSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }
  const { workOrderId, ...rest } = parsed.data;
  try {
    await updateWorkOrder(actor.id, workOrderId, {
      ...rest,
      plannedStartAt: await toUtc(rest.plannedStartAt),
      dueAt: await toUtc(rest.dueAt),
      tags: parseTags(rest.tags),
      assetIds: parseMulti(formData, "assetIds"),
      assigneeIds: parseMulti(formData, "assigneeIds"),
    });
  } catch (err) {
    return friendly(err);
  }
  revalidatePath(`/work-orders/${workOrderId}`);
  revalidatePath("/work-orders");
  redirect(`/work-orders/${workOrderId}`);
}

const statusSchema = z.object({
  workOrderId: z.coerce.number().int().positive(),
  status: z.enum([
    "draft",
    "open",
    "assigned",
    "in_progress",
    "on_hold",
    "waiting",
    "completed",
    "canceled",
  ]),
  note: z.string().trim().max(2000).optional(),
  completionNotes: z.string().trim().max(10000).optional(),
  actualDowntimeMinutes: optionalMinutes,
});

export async function changeWoStatusAction(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const actor = await assertRole("admin", "manager", "technician").catch(
    () => null,
  );
  if (!actor) return { error: "Not allowed." };
  const parsed = statusSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }
  try {
    await changeWorkOrderStatus(actor, parsed.data.workOrderId, parsed.data.status, {
      note: parsed.data.note,
      completionNotes: parsed.data.completionNotes,
      actualDowntimeMinutes: parsed.data.actualDowntimeMinutes,
    });
  } catch (err) {
    return friendly(err);
  }
  revalidatePath(`/work-orders/${parsed.data.workOrderId}`);
  redirect(`/work-orders/${parsed.data.workOrderId}`);
}

const commentSchema = z.object({
  workOrderId: z.coerce.number().int().positive(),
  body: z.string().trim().min(1, "Comment cannot be empty").max(10000),
});

export async function addWoCommentAction(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const actor = await assertRole("admin", "manager", "technician").catch(
    () => null,
  );
  if (!actor) return { error: "Not allowed." };
  const parsed = commentSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }
  try {
    await addComment(actor, "work_order", parsed.data.workOrderId, parsed.data.body);
  } catch (err) {
    return friendly(err);
  }
  revalidatePath(`/work-orders/${parsed.data.workOrderId}`);
  redirect(`/work-orders/${parsed.data.workOrderId}`);
}

const laborSchema = z.object({
  workOrderId: z.coerce.number().int().positive(),
  hours: z.coerce.number().min(0).max(24).default(0),
  minutes: z.coerce.number().min(0).max(59).default(0),
  note: z.string().trim().max(1000).optional(),
  workDate: z.string().optional(),
});

export async function addLaborAction(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const actor = await assertRole("admin", "manager", "technician").catch(
    () => null,
  );
  if (!actor) return { error: "Not allowed." };
  const parsed = laborSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }
  const totalMinutes = Math.round(parsed.data.hours * 60 + parsed.data.minutes);
  try {
    await addLabor(actor, parsed.data.workOrderId, {
      minutes: totalMinutes,
      note: parsed.data.note,
      workDate: parsed.data.workDate || null,
    });
  } catch (err) {
    return friendly(err);
  }
  revalidatePath(`/work-orders/${parsed.data.workOrderId}`);
  redirect(`/work-orders/${parsed.data.workOrderId}`);
}

const partSchema = z.object({
  workOrderId: z.coerce.number().int().positive(),
  name: z.string().trim().min(1, "Part name is required").max(300),
  quantity: z.coerce.number().positive("Quantity must be positive").max(100000),
  unitCost: z
    .union([z.literal(""), z.coerce.number().min(0).max(1e9)])
    .optional()
    .transform((v) => (v === "" || v === undefined ? null : v)),
  note: z.string().trim().max(1000).optional(),
});

export async function addPartAction(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const actor = await assertRole("admin", "manager", "technician").catch(
    () => null,
  );
  if (!actor) return { error: "Not allowed." };
  const parsed = partSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }
  try {
    await addPart(actor, parsed.data.workOrderId, {
      name: parsed.data.name,
      quantity: parsed.data.quantity,
      unitCost: parsed.data.unitCost,
      note: parsed.data.note,
    });
  } catch (err) {
    return friendly(err);
  }
  revalidatePath(`/work-orders/${parsed.data.workOrderId}`);
  redirect(`/work-orders/${parsed.data.workOrderId}`);
}

const removePartSchema = z.object({
  workOrderId: z.coerce.number().int().positive(),
  partId: z.coerce.number().int().positive(),
});

export async function removePartAction(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const actor = await assertRole("admin", "manager", "technician").catch(
    () => null,
  );
  if (!actor) return { error: "Not allowed." };
  const parsed = removePartSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }
  try {
    await removePart(actor, parsed.data.partId);
  } catch (err) {
    return friendly(err);
  }
  revalidatePath(`/work-orders/${parsed.data.workOrderId}`);
  redirect(`/work-orders/${parsed.data.workOrderId}`);
}

const woReadingSchema = z.object({
  workOrderId: z.coerce.number().int().positive(),
  meterId: z.coerce.number().int().positive(),
  value: z.coerce.number(),
  isRollover: z.string().optional(),
  note: z.string().trim().max(1000).optional(),
});

/**
 * Record a meter reading from the work-order page. Same service path as the
 * meter screen (validation, audit, triggers) — the WO id is only used to
 * return the technician to the job they're documenting.
 */
export async function addWoMeterReadingAction(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const actor = await assertRole("admin", "manager", "technician").catch(
    () => null,
  );
  if (!actor) return { error: "Not allowed." };
  const parsed = woReadingSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }
  try {
    await addReading(actor, parsed.data.meterId, {
      value: parsed.data.value,
      note: parsed.data.note,
      isRollover: parsed.data.isRollover === "1",
    });
  } catch (err) {
    return friendly(err);
  }
  revalidatePath(`/work-orders/${parsed.data.workOrderId}`);
  redirect(`/work-orders/${parsed.data.workOrderId}`);
}
