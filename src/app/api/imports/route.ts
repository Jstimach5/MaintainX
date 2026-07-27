import crypto from "crypto";
import { NextResponse } from "next/server";
import { assertRole, AuthError } from "@/server/auth/guards";
import { db } from "@/server/db";
import { importJobs } from "@/server/db/schema";
import { autoMap, parseImportFile } from "@/server/services/imports";
import { recordAudit } from "@/server/services/audit";
import { storage } from "@/server/storage";
import { ServiceError } from "@/server/services/users";

/** Upload a CSV/XLSX and create an import job in `mapping` state (§12). */
export async function POST(request: Request): Promise<Response> {
  let actor;
  try {
    actor = await assertRole("admin");
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    throw err;
  }
  const form = await request.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return NextResponse.json({ error: "Choose a CSV or XLSX file." }, { status: 400 });
  }
  if (!/\.(csv|xlsx)$/i.test(file.name)) {
    return NextResponse.json(
      { error: "Only .csv and .xlsx files are supported." },
      { status: 400 },
    );
  }
  if (file.size > 50 * 1024 * 1024) {
    return NextResponse.json({ error: "File too large (50 MB max)." }, { status: 400 });
  }
  const data = Buffer.from(await file.arrayBuffer());

  let headers: string[];
  let rowCount: number;
  try {
    const parsed = await parseImportFile(file.name, data);
    headers = parsed.headers;
    rowCount = parsed.rows.length;
  } catch (err) {
    if (err instanceof ServiceError) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    return NextResponse.json(
      { error: "Could not read that file — is it a valid CSV/XLSX?" },
      { status: 400 },
    );
  }
  if (rowCount === 0) {
    return NextResponse.json({ error: "The file has no data rows." }, { status: 400 });
  }

  const ext = /\.xlsx$/i.test(file.name) ? "xlsx" : "csv";
  const storedName = `${crypto.randomUUID()}.${ext}`;
  await storage.put(storedName, data);

  const [job] = await db
    .insert(importJobs)
    .values({
      filename: file.name,
      storedName,
      headers,
      mapping: autoMap(headers),
      totalRows: rowCount,
      createdBy: actor.id,
    })
    .returning({ id: importJobs.id });
  await recordAudit(db, {
    userId: actor.id,
    action: "import.uploaded",
    entityType: "import_job",
    entityId: job.id,
    summary: `Uploaded ${file.name} (${rowCount} rows)`,
    correlationId: `import-${job.id}`,
  });
  return NextResponse.json({ id: job.id });
}
