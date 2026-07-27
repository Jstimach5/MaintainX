import { Readable } from "stream";
import { NextResponse } from "next/server";
import { assertUser, AuthError } from "@/server/auth/guards";
import { getAttachment } from "@/server/services/attachments";
import { ALLOWED_TYPES, storage } from "@/server/storage";

/**
 * Auth-gated file serving. The stored key comes from the DB row (never the
 * URL), the mime type is re-validated against the allowlist at serve time,
 * and Content-Disposition carries no client-controlled filename — three
 * layers against traversal, stored-XSS, and header injection.
 *
 * Requesters can only fetch attachments on their own requests (enforced in
 * Phase 6 when requests exist; until then requesters get 403 here).
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  let user;
  try {
    user = await assertUser();
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    throw err;
  }

  const { id } = await params;
  const attachmentId = Number(id);
  if (!Number.isInteger(attachmentId) || attachmentId <= 0) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const row = await getAttachment(attachmentId);
  if (!row) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  if (user.role === "requester") {
    // Requesters see only attachments on their own requests (§8).
    if (row.entityType !== "request") {
      return NextResponse.json({ error: "Not allowed" }, { status: 403 });
    }
    const { getRequest } = await import("@/server/services/requests");
    const req = await getRequest(row.entityId);
    if (!req || req.requesterId !== user.id) {
      return NextResponse.json({ error: "Not allowed" }, { status: 403 });
    }
  }

  if (!ALLOWED_TYPES[row.mimeType]) {
    return NextResponse.json({ error: "Unavailable" }, { status: 410 });
  }
  if (!(await storage.exists(row.storedName))) {
    return NextResponse.json({ error: "File missing" }, { status: 404 });
  }

  const stream = storage.createReadStream(row.storedName);
  return new Response(Readable.toWeb(stream) as ReadableStream, {
    headers: {
      "Content-Type": row.mimeType,
      "Content-Length": String(row.sizeBytes),
      "Content-Disposition": "inline",
      "Cache-Control": "private, max-age=86400",
    },
  });
}
