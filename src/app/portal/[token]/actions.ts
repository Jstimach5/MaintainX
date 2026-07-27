"use server";

import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/server/db";
import { sites } from "@/server/db/schema";
import { createRequest, getRequest } from "@/server/services/requests";
import { createAttachment } from "@/server/services/attachments";
import { ServiceError } from "@/server/services/users";
import { MAX_UPLOAD_BYTES } from "@/server/storage";
import type { ActionResult } from "@/components/forms";

/**
 * Public-portal rate limit (§16): 5 submissions per IP per hour, in-memory.
 * Single-process deployment makes this sufficient for an internal portal.
 */
const buckets = new Map<string, { count: number; resetAt: number }>();
const LIMIT = 5;
const WINDOW_MS = 60 * 60 * 1000;

function allow(ip: string): boolean {
  const now = Date.now();
  const bucket = buckets.get(ip);
  if (!bucket || bucket.resetAt < now) {
    buckets.set(ip, { count: 1, resetAt: now + WINDOW_MS });
    return true;
  }
  if (bucket.count >= LIMIT) return false;
  bucket.count += 1;
  return true;
}

const optionalId = z
  .union([z.literal(""), z.coerce.number().int().positive()])
  .optional()
  .transform((v) => (v === "" || v === undefined ? null : v));

const portalSchema = z.object({
  token: z.string().min(16).max(64),
  title: z.string().trim().min(1, "Tell us what needs attention").max(300),
  description: z.string().trim().max(10000).optional(),
  requesterName: z.string().trim().min(1, "Your name is required").max(200),
  requesterContact: z.string().trim().max(300).optional(),
  locationId: optionalId,
  assetId: optionalId,
  priority: z.enum(["low", "medium", "high", "critical"]).default("medium"),
});

export async function portalSubmitAction(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const parsed = portalSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }
  const rows = await db
    .select()
    .from(sites)
    .where(eq(sites.portalToken, parsed.data.token))
    .limit(1);
  const site = rows[0];
  if (!site || !site.isActive) return { error: "This portal link is not valid." };

  const hdrs = await headers();
  const ip =
    hdrs.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    hdrs.get("x-real-ip") ||
    "unknown";
  if (!allow(ip)) {
    return {
      error:
        "Too many requests from this device — wait a while and try again, or contact the maintenance team directly.",
    };
  }

  let id: number;
  try {
    id = await createRequest({
      title: parsed.data.title,
      description: parsed.data.description,
      siteId: site.id,
      locationId: parsed.data.locationId,
      assetId: parsed.data.assetId,
      priority: parsed.data.priority,
      requesterName: parsed.data.requesterName,
      requesterContact: parsed.data.requesterContact,
      source: "portal",
    });
  } catch (err) {
    if (err instanceof ServiceError) return { error: err.message };
    throw err;
  }

  // Optional pictures, uploaded anonymously (uploadedBy null).
  const files = formData
    .getAll("photos")
    .filter((f): f is File => f instanceof File && f.size > 0)
    .slice(0, 5);
  for (const file of files) {
    if (file.size > MAX_UPLOAD_BYTES) continue;
    try {
      await createAttachment({
        actorId: null,
        entityType: "request",
        entityId: id,
        originalName: file.name || null,
        mimeType: file.type,
        data: Buffer.from(await file.arrayBuffer()),
        source: "portal",
      });
    } catch {
      // Bad file types are skipped silently on the public form; the request
      // itself already went through.
    }
  }

  const req = await getRequest(id);
  redirect(`/portal/${parsed.data.token}?submitted=${req?.requestNumber ?? "OK"}`);
}
