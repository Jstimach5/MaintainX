"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { assertRole, assertUser, AuthError } from "@/server/auth/guards";
import { ServiceError } from "@/server/services/users";
import {
  convertRequest,
  createRequest,
  decideRequest,
  getRequest,
  setUnderReview,
} from "@/server/services/requests";
import { addComment } from "@/server/services/workOrders";
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

const requestSchema = z.object({
  title: z.string().trim().min(1, "Title is required").max(300),
  description: z.string().trim().max(10000).optional(),
  siteId: z.coerce.number().int().positive("Site is required"),
  locationId: optionalId,
  assetId: optionalId,
  priority: z.enum(["none", "low", "medium", "high", "critical"]),
  category: z.string().trim().max(100).optional(),
  requestedCompletionDate: z.string().optional(),
});

export async function createRequestAction(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const actor = await assertUser().catch(() => null);
  if (!actor) return { error: "Not signed in." };
  const parsed = requestSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }
  let id: number;
  try {
    id = await createRequest({
      ...parsed.data,
      requestedCompletionDate: parsed.data.requestedCompletionDate || null,
      requesterId: actor.id,
      requesterName: actor.displayName,
      source: "internal",
    });
  } catch (err) {
    return friendly(err);
  }
  revalidatePath("/requests");
  redirect(`/requests/${id}`);
}

const decisionSchema = z.object({
  requestId: z.coerce.number().int().positive(),
  decision: z.enum(["under_review", "approved", "declined", "convert"]),
  reason: z.string().trim().max(2000).optional(),
});

export async function decideRequestAction(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const actor = await assertRole("admin", "manager").catch(() => null);
  if (!actor) return { error: "Not allowed." };
  const parsed = decisionSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }
  const { requestId, decision, reason } = parsed.data;
  try {
    if (decision === "under_review") {
      await setUnderReview(actor, requestId);
    } else if (decision === "convert") {
      const woId = await convertRequest(actor, requestId);
      revalidatePath(`/requests/${requestId}`);
      redirect(`/work-orders/${woId}`);
    } else {
      await decideRequest(actor, requestId, decision, reason);
    }
  } catch (err) {
    return friendly(err);
  }
  revalidatePath(`/requests/${requestId}`);
  redirect(`/requests/${requestId}`);
}

const commentSchema = z.object({
  requestId: z.coerce.number().int().positive(),
  body: z.string().trim().min(1, "Comment cannot be empty").max(10000),
  isInternal: z.enum(["true", "false"]).default("false"),
});

export async function addRequestCommentAction(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const actor = await assertUser().catch(() => null);
  if (!actor) return { error: "Not signed in." };
  const parsed = commentSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }
  const req = await getRequest(parsed.data.requestId);
  if (!req) return { error: "Request not found." };
  const isInternal = parsed.data.isInternal === "true";
  // Requesters: only their own requests, never internal notes.
  if (actor.role === "requester") {
    if (req.requesterId !== actor.id) return { error: "Not allowed." };
    if (isInternal) return { error: "Not allowed." };
  }
  if (isInternal && actor.role !== "admin" && actor.role !== "manager") {
    return { error: "Only managers can add internal notes." };
  }
  try {
    await addComment(actor, "request", parsed.data.requestId, parsed.data.body, isInternal);
  } catch (err) {
    return friendly(err);
  }
  revalidatePath(`/requests/${parsed.data.requestId}`);
  redirect(`/requests/${parsed.data.requestId}`);
}
