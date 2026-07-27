"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { assertRole, AuthError } from "@/server/auth/guards";
import { ServiceError } from "@/server/services/users";
import { createSite, updateSite } from "@/server/services/sites";
import { createLocation, updateLocation } from "@/server/services/locations";
import type { ActionResult } from "@/components/forms";

function friendly(err: unknown): ActionResult {
  if (err instanceof ServiceError || err instanceof AuthError) {
    return { error: err.message };
  }
  throw err;
}

const siteSchema = z.object({
  name: z.string().trim().min(1, "Site name is required").max(200),
  code: z.string().trim().max(50).optional(),
  address: z.string().trim().max(500).optional(),
  description: z.string().trim().max(2000).optional(),
});

export async function createSiteAction(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const actor = await assertRole("admin").catch(() => null);
  if (!actor) return { error: "Not allowed." };
  const parsed = siteSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }
  let id: number;
  try {
    id = await createSite(actor.id, parsed.data);
  } catch (err) {
    return friendly(err);
  }
  revalidatePath("/sites");
  redirect(`/sites/${id}`);
}

const siteUpdateSchema = siteSchema.extend({
  siteId: z.coerce.number().int().positive(),
  isActive: z.enum(["true", "false"]),
});

export async function updateSiteAction(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const actor = await assertRole("admin").catch(() => null);
  if (!actor) return { error: "Not allowed." };
  const parsed = siteUpdateSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }
  const { siteId, isActive, ...rest } = parsed.data;
  try {
    await updateSite(actor.id, siteId, {
      ...rest,
      isActive: isActive === "true",
    });
  } catch (err) {
    return friendly(err);
  }
  revalidatePath("/sites");
  revalidatePath(`/sites/${siteId}`);
  redirect(`/sites/${siteId}`);
}

const portalSchema = z.object({
  siteId: z.coerce.number().int().positive(),
  enable: z.enum(["true", "false"]),
});

/** Enable/disable the public request portal for a site (§8). */
export async function togglePortalAction(formData: FormData): Promise<void> {
  const actor = await assertRole("admin");
  const parsed = portalSchema.parse(Object.fromEntries(formData));
  const { setPortalEnabled } = await import("@/server/services/sites");
  await setPortalEnabled(actor.id, parsed.siteId, parsed.enable === "true");
  revalidatePath(`/sites/${parsed.siteId}`);
}

const locationSchema = z.object({
  siteId: z.coerce.number().int().positive(),
  parentId: z
    .union([z.literal(""), z.coerce.number().int().positive()])
    .optional(),
  name: z.string().trim().min(1, "Location name is required").max(200),
  code: z.string().trim().max(50).optional(),
  description: z.string().trim().max(2000).optional(),
});

export async function createLocationAction(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const actor = await assertRole("admin").catch(() => null);
  if (!actor) return { error: "Not allowed." };
  const parsed = locationSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }
  const { siteId, parentId, ...rest } = parsed.data;
  try {
    await createLocation(actor.id, {
      siteId,
      parentId: parentId === "" || parentId === undefined ? null : parentId,
      ...rest,
    });
  } catch (err) {
    return friendly(err);
  }
  revalidatePath(`/sites/${siteId}`);
  redirect(`/sites/${siteId}`);
}

const locationUpdateSchema = z.object({
  locationId: z.coerce.number().int().positive(),
  siteId: z.coerce.number().int().positive(),
  parentId: z
    .union([z.literal(""), z.coerce.number().int().positive()])
    .optional(),
  name: z.string().trim().min(1, "Location name is required").max(200),
  code: z.string().trim().max(50).optional(),
  description: z.string().trim().max(2000).optional(),
  isActive: z.enum(["true", "false"]),
});

export async function updateLocationAction(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const actor = await assertRole("admin").catch(() => null);
  if (!actor) return { error: "Not allowed." };
  const parsed = locationUpdateSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }
  const { locationId, siteId, parentId, isActive, ...rest } = parsed.data;
  try {
    await updateLocation(actor.id, locationId, {
      ...rest,
      parentId: parentId === "" || parentId === undefined ? null : parentId,
      isActive: isActive === "true",
    });
  } catch (err) {
    return friendly(err);
  }
  revalidatePath(`/sites/${siteId}`);
  redirect(`/sites/${siteId}`);
}
