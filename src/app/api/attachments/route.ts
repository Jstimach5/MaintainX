import { NextResponse } from "next/server";
import { z } from "zod";
import { assertUser, AuthError } from "@/server/auth/guards";
import {
  createAttachment,
  type AttachmentCategory,
  type AttachmentEntityType,
} from "@/server/services/attachments";
import { ServiceError } from "@/server/services/users";
import { MAX_UPLOAD_BYTES } from "@/server/storage";

const metaSchema = z.object({
  entityType: z.enum([
    "asset",
    "work_order",
    "request",
    "procedure_response",
    "meter_reading",
    "comment",
  ]),
  entityId: z.coerce.number().int().positive(),
  category: z
    .enum(["general", "main", "before", "during", "after", "inspection", "damage"])
    .default("general"),
  caption: z.string().max(500).optional(),
});

/**
 * Multipart upload endpoint used by the app UI (route handler rather than a
 * server action to avoid action body-size limits). Requesters may only
 * upload to their OWN work requests; internal roles anywhere. Anonymous
 * portal uploads flow through the portal action, not this route.
 */
export async function POST(request: Request): Promise<Response> {
  let actor;
  try {
    actor = await assertUser();
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    throw err;
  }

  const form = await request.formData().catch(() => null);
  if (!form) {
    return NextResponse.json({ error: "Invalid form data" }, { status: 400 });
  }
  const parsed = metaSchema.safeParse({
    entityType: form.get("entityType"),
    entityId: form.get("entityId"),
    category: form.get("category") ?? undefined,
    caption: form.get("caption") ?? undefined,
  });
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid input" },
      { status: 400 },
    );
  }

  if (actor.role === "requester") {
    if (parsed.data.entityType !== "request") {
      return NextResponse.json({ error: "Not allowed" }, { status: 403 });
    }
    const { getRequest } = await import("@/server/services/requests");
    const req = await getRequest(parsed.data.entityId);
    if (!req || req.requesterId !== actor.id) {
      return NextResponse.json({ error: "Not allowed" }, { status: 403 });
    }
  }

  const files = form
    .getAll("files")
    .filter((f): f is File => f instanceof File && f.size > 0);
  if (files.length === 0) {
    return NextResponse.json({ error: "No files provided" }, { status: 400 });
  }
  if (files.length > 10) {
    return NextResponse.json(
      { error: "At most 10 files per upload" },
      { status: 400 },
    );
  }

  const ids: number[] = [];
  const errors: string[] = [];
  for (const file of files) {
    if (file.size > MAX_UPLOAD_BYTES) {
      errors.push(`${file.name}: too large (limit 25 MB)`);
      continue;
    }
    try {
      const id = await createAttachment({
        actorId: actor.id,
        entityType: parsed.data.entityType as AttachmentEntityType,
        entityId: parsed.data.entityId,
        category: parsed.data.category as AttachmentCategory,
        originalName: file.name || null,
        mimeType: file.type,
        data: Buffer.from(await file.arrayBuffer()),
        caption: parsed.data.caption ?? null,
      });
      ids.push(id);
    } catch (err) {
      if (err instanceof ServiceError) {
        errors.push(`${file.name}: ${err.message}`);
      } else {
        throw err;
      }
    }
  }

  if (ids.length === 0) {
    return NextResponse.json(
      { error: errors.join("; ") || "Upload failed" },
      { status: 400 },
    );
  }
  return NextResponse.json({ ids, errors });
}
