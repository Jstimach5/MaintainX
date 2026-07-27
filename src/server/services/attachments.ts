import crypto from "crypto";
import { and, asc, eq } from "drizzle-orm";
import { db } from "@/server/db";
import { assets, attachments } from "@/server/db/schema";
import {
  ALLOWED_TYPES,
  MAX_UPLOAD_BYTES,
  storage,
} from "@/server/storage";
import { recordAudit } from "./audit";
import { ServiceError } from "./users";

export type AttachmentEntityType =
  | "asset"
  | "work_order"
  | "request"
  | "procedure_response"
  | "meter_reading"
  | "comment";

export type AttachmentCategory =
  | "general"
  | "main"
  | "before"
  | "during"
  | "after"
  | "inspection"
  | "damage";

const ENTITY_TYPES: Set<string> = new Set([
  "asset",
  "work_order",
  "request",
  "procedure_response",
  "meter_reading",
  "comment",
]);

export async function listAttachments(
  entityType: AttachmentEntityType,
  entityId: number,
) {
  return db
    .select()
    .from(attachments)
    .where(
      and(
        eq(attachments.entityType, entityType),
        eq(attachments.entityId, entityId),
      ),
    )
    .orderBy(asc(attachments.createdAt));
}

export async function getAttachment(id: number) {
  const rows = await db
    .select()
    .from(attachments)
    .where(eq(attachments.id, id))
    .limit(1);
  return rows[0] ?? null;
}

/**
 * Store a validated upload: file to disk, row to DB. On any DB failure the
 * file is removed again — invariant: file on disk ⟺ row in attachments.
 */
export async function createAttachment(input: {
  actorId: number;
  entityType: AttachmentEntityType;
  entityId: number;
  category?: AttachmentCategory;
  originalName: string | null;
  mimeType: string;
  data: Buffer;
  caption?: string | null;
  source?: "web" | "portal";
}): Promise<number> {
  if (!ENTITY_TYPES.has(input.entityType)) {
    throw new ServiceError("Unknown attachment target.");
  }
  const ext = ALLOWED_TYPES[input.mimeType];
  if (!ext) {
    throw new ServiceError(
      "That file type is not allowed. Pictures (JPG/PNG/WebP/GIF/HEIC), PDF, TXT, CSV, XLSX, and DOCX are accepted.",
    );
  }
  if (input.data.length === 0) {
    throw new ServiceError("The uploaded file is empty.");
  }
  if (input.data.length > MAX_UPLOAD_BYTES) {
    throw new ServiceError(
      `File is too large (${Math.round(input.data.length / 1024 / 1024)} MB). Limit is ${MAX_UPLOAD_BYTES / 1024 / 1024} MB.`,
    );
  }

  const key = `${crypto.randomUUID()}.${ext}`;
  await storage.put(key, input.data);
  try {
    return await db.transaction(async (tx) => {
      const [row] = await tx
        .insert(attachments)
        .values({
          entityType: input.entityType,
          entityId: input.entityId,
          category: input.category ?? "general",
          storedName: key,
          originalName: input.originalName,
          mimeType: input.mimeType,
          sizeBytes: input.data.length,
          caption: input.caption ?? null,
          uploadedBy: input.actorId,
        })
        .returning({ id: attachments.id });
      await recordAudit(tx, {
        userId: input.actorId,
        action: "attachment.upload",
        entityType: input.entityType,
        entityId: input.entityId,
        summary: `Uploaded ${input.originalName ?? "a file"} (${input.category ?? "general"})`,
        source: input.source ?? "web",
      });
      return row.id;
    });
  } catch (err) {
    await storage.delete(key); // keep the invariant on failure
    throw err;
  }
}

/** Delete row + file. Permission checks live in the caller. */
export async function deleteAttachment(
  actorId: number,
  attachmentId: number,
): Promise<void> {
  const existing = await getAttachment(attachmentId);
  if (!existing) throw new ServiceError("Attachment not found.");
  await db.transaction(async (tx) => {
    // Clear any main-picture reference before deleting (FK).
    await tx
      .update(assets)
      .set({ mainAttachmentId: null })
      .where(eq(assets.mainAttachmentId, attachmentId));
    await tx.delete(attachments).where(eq(attachments.id, attachmentId));
    await recordAudit(tx, {
      userId: actorId,
      action: "attachment.delete",
      entityType: existing.entityType,
      entityId: existing.entityId,
      summary: `Deleted attachment ${existing.originalName ?? existing.storedName}`,
    });
  });
  await storage.delete(existing.storedName);
}
