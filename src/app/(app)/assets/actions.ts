"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { assertRole, AuthError } from "@/server/auth/guards";
import { ServiceError } from "@/server/services/users";
import {
  changeAssetStatus,
  createAsset,
  setAssetArchived,
  setMainPicture,
  transferAsset,
  updateAsset,
} from "@/server/services/assets";
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

const assetSchema = z.object({
  assetNumber: z.string().trim().max(50).optional(),
  name: z.string().trim().min(1, "Name is required").max(200),
  description: z.string().trim().max(5000).optional(),
  assetType: z.string().trim().max(100).optional(),
  siteId: z.coerce.number().int().positive("Site is required"),
  locationId: optionalId,
  parentAssetId: optionalId,
  make: z.string().trim().max(100).optional(),
  model: z.string().trim().max(100).optional(),
  serialNumber: z.string().trim().max(100).optional(),
  year: z
    .union([z.literal(""), z.coerce.number().int().min(1900).max(2100)])
    .optional()
    .transform((v) => (v === "" || v === undefined ? null : v)),
  purchaseDate: z.string().optional(),
  inServiceDate: z.string().optional(),
  warrantyInfo: z.string().trim().max(2000).optional(),
  criticality: z.enum(["low", "medium", "high", "critical"]),
  responsibleTeamId: optionalId,
  responsibleUserId: optionalId,
  notes: z.string().trim().max(5000).optional(),
  tags: z.string().trim().max(500).optional(),
});

function parseTags(raw: string | undefined): string[] {
  return (raw ?? "")
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean);
}

export async function createAssetAction(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const actor = await assertRole("admin").catch(() => null);
  if (!actor) return { error: "Not allowed." };
  const parsed = assetSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }
  let id: number;
  try {
    id = await createAsset(actor.id, {
      ...parsed.data,
      purchaseDate: parsed.data.purchaseDate || null,
      inServiceDate: parsed.data.inServiceDate || null,
      tags: parseTags(parsed.data.tags),
    });
  } catch (err) {
    return friendly(err);
  }
  revalidatePath("/assets");
  redirect(`/assets/${id}`);
}

const assetUpdateSchema = assetSchema.omit({ siteId: true, locationId: true }).extend({
  assetId: z.coerce.number().int().positive(),
});

export async function updateAssetAction(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const actor = await assertRole("admin").catch(() => null);
  if (!actor) return { error: "Not allowed." };
  const parsed = assetUpdateSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }
  const { assetId, ...rest } = parsed.data;
  try {
    await updateAsset(actor.id, assetId, {
      ...rest,
      purchaseDate: rest.purchaseDate || null,
      inServiceDate: rest.inServiceDate || null,
      tags: parseTags(rest.tags),
    });
  } catch (err) {
    return friendly(err);
  }
  revalidatePath(`/assets/${assetId}`);
  revalidatePath("/assets");
  redirect(`/assets/${assetId}`);
}

const statusSchema = z.object({
  assetId: z.coerce.number().int().positive(),
  status: z.enum([
    "online",
    "offline",
    "limited",
    "planned_downtime",
    "unplanned_downtime",
    "out_for_repair",
    "retired",
    "not_tracked",
  ]),
  note: z.string().trim().max(1000).optional(),
});

/** Field roles may update asset status (§7/§11 downtime flows). */
export async function changeAssetStatusAction(
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
    await changeAssetStatus(
      actor.id,
      parsed.data.assetId,
      parsed.data.status,
      parsed.data.note,
    );
  } catch (err) {
    return friendly(err);
  }
  revalidatePath(`/assets/${parsed.data.assetId}`);
  redirect(`/assets/${parsed.data.assetId}`);
}

const transferSchema = z.object({
  assetId: z.coerce.number().int().positive(),
  siteId: z.coerce.number().int().positive("Site is required"),
  locationId: optionalId,
  note: z.string().trim().max(1000).optional(),
});

export async function transferAssetAction(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const actor = await assertRole("admin", "manager").catch(() => null);
  if (!actor) return { error: "Not allowed." };
  const parsed = transferSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }
  try {
    await transferAsset(actor.id, parsed.data.assetId, {
      siteId: parsed.data.siteId,
      locationId: parsed.data.locationId,
      note: parsed.data.note,
    });
  } catch (err) {
    return friendly(err);
  }
  revalidatePath(`/assets/${parsed.data.assetId}`);
  redirect(`/assets/${parsed.data.assetId}`);
}

const archiveSchema = z.object({
  assetId: z.coerce.number().int().positive(),
  archived: z.enum(["true", "false"]),
});

export async function setAssetArchivedAction(formData: FormData): Promise<void> {
  const actor = await assertRole("admin");
  const parsed = archiveSchema.parse(Object.fromEntries(formData));
  await setAssetArchived(actor.id, parsed.assetId, parsed.archived === "true");
  revalidatePath(`/assets/${parsed.assetId}`);
  revalidatePath("/assets");
}

const mainPictureSchema = z.object({
  assetId: z.coerce.number().int().positive(),
  attachmentId: z.coerce.number().int().positive(),
});

export async function setMainPictureAction(formData: FormData): Promise<void> {
  const actor = await assertRole("admin", "manager");
  const parsed = mainPictureSchema.parse(Object.fromEntries(formData));
  await setMainPicture(actor.id, parsed.assetId, parsed.attachmentId);
  revalidatePath(`/assets/${parsed.assetId}`);
}
