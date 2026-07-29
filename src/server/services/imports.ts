import { parse as parseCsv } from "csv-parse/sync";
import ExcelJS from "exceljs";
import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/server/db";
import {
  assets,
  comments,
  importJobs,
  importMappings,
  importRows,
  locations,
  sites,
  teams,
  users,
  workOrderAssets,
  workOrderAssignments,
  workOrderLabor,
  workOrders,
  workOrderStatusHistory,
} from "@/server/db/schema";
import { recordAudit } from "./audit";
import { ServiceError } from "./users";

export type ImportJobRow = typeof importJobs.$inferSelect;

/** Importable fields (§12). Title is the only hard-required field. */
export const IMPORT_FIELDS = [
  { key: "externalId", label: "External ID" },
  { key: "title", label: "Title (required)" },
  { key: "description", label: "Description" },
  { key: "status", label: "Status" },
  { key: "priority", label: "Priority" },
  { key: "workType", label: "Work type" },
  { key: "site", label: "Site (name or code)" },
  { key: "location", label: "Location (name or code)" },
  { key: "asset", label: "Asset (number or name)" },
  { key: "assignedUser", label: "Assigned user (username)" },
  { key: "assignedTeam", label: "Assigned team (name)" },
  { key: "requester", label: "Requester (username)" },
  { key: "createdDate", label: "Created date" },
  { key: "plannedStart", label: "Planned start" },
  { key: "dueDate", label: "Due date" },
  { key: "completionDate", label: "Completion date" },
  { key: "estimatedMinutes", label: "Estimated minutes" },
  { key: "actualMinutes", label: "Actual labor minutes" },
  { key: "plannedDowntimeMinutes", label: "Planned downtime (min)" },
  { key: "actualDowntimeMinutes", label: "Actual downtime (min)" },
  { key: "tags", label: "Tags (comma-separated)" },
  { key: "completionNotes", label: "Completion notes" },
] as const;

export type ImportFieldKey = (typeof IMPORT_FIELDS)[number]["key"];

// ---------------------------------------------------------------------------
// Normalization (§12): common variants map cleanly; ambiguity = error.
// ---------------------------------------------------------------------------

const STATUS_MAP: Record<string, string> = {
  draft: "draft",
  open: "open",
  new: "open",
  assigned: "assigned",
  "in progress": "in_progress",
  "in-progress": "in_progress",
  in_progress: "in_progress",
  wip: "in_progress",
  started: "in_progress",
  "on hold": "on_hold",
  on_hold: "on_hold",
  hold: "on_hold",
  paused: "paused",
  waiting: "waiting",
  blocked: "waiting",
  "waiting for parts": "waiting",
  "waiting on parts": "waiting",
  "waiting for approval": "waiting_approval",
  waiting_approval: "waiting_approval",
  "pending approval": "waiting_approval",
  completed: "completed",
  complete: "completed",
  done: "completed",
  closed: "completed",
  finished: "completed",
  canceled: "canceled",
  cancelled: "canceled",
};

const PRIORITY_MAP: Record<string, string> = {
  none: "none",
  low: "low",
  medium: "medium",
  med: "medium",
  normal: "medium",
  high: "high",
  urgent: "critical",
  critical: "critical",
};

const TYPE_MAP: Record<string, string> = {
  preventive: "preventive",
  pm: "preventive",
  reactive: "reactive",
  repair: "reactive",
  breakdown: "reactive",
  inspection: "inspection",
  corrective: "corrective",
  safety: "safety",
  project: "project",
  other: "other",
};

export function normalizeStatus(raw: string): string | null {
  return STATUS_MAP[raw.trim().toLowerCase()] ?? null;
}
export function normalizePriority(raw: string): string | null {
  return PRIORITY_MAP[raw.trim().toLowerCase()] ?? null;
}
export function normalizeType(raw: string): string | null {
  return TYPE_MAP[raw.trim().toLowerCase()] ?? null;
}

/** Accepts ISO (YYYY-MM-DD[ HH:MM]), US M/D/YYYY, and Date objects. */
export function parseImportDate(raw: unknown): Date | null {
  if (raw instanceof Date) return Number.isNaN(raw.getTime()) ? null : raw;
  if (typeof raw !== "string") return null;
  const s = raw.trim();
  if (!s) return null;
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2}))?/);
  if (m) {
    return new Date(
      Date.UTC(+m[1], +m[2] - 1, +m[3], m[4] ? +m[4] : 12, m[5] ? +m[5] : 0),
    );
  }
  m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (m) {
    return new Date(Date.UTC(+m[3], +m[1] - 1, +m[2], 12, 0));
  }
  return null;
}

/** Dangerous-spreadsheet-content check (§12): formulas never import. */
function sanitizeText(raw: unknown): { value: string; dangerous: boolean } {
  const s = String(raw ?? "").trim();
  return { value: s, dangerous: /^[=+@]/.test(s) };
}

// ---------------------------------------------------------------------------
// File parsing
// ---------------------------------------------------------------------------

export async function parseImportFile(
  filename: string,
  data: Buffer,
): Promise<{ headers: string[]; rows: Record<string, unknown>[] }> {
  if (/\.xlsx$/i.test(filename)) {
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(data as unknown as ArrayBuffer);
    const ws = wb.worksheets[0];
    if (!ws) throw new ServiceError("The workbook has no sheets.");
    const headers: string[] = [];
    ws.getRow(1).eachCell({ includeEmpty: false }, (cell, col) => {
      headers[col - 1] = String(cell.value ?? "").trim();
    });
    const rows: Record<string, unknown>[] = [];
    ws.eachRow((row, rowNumber) => {
      if (rowNumber === 1) return;
      const record: Record<string, unknown> = {};
      let hasValue = false;
      headers.forEach((h, i) => {
        if (!h) return;
        const cell = row.getCell(i + 1);
        let v: unknown = cell.value;
        // Formula cells import their cached RESULT, never the formula.
        if (v && typeof v === "object" && "result" in (v as object)) {
          v = (v as { result: unknown }).result;
        }
        if (v && typeof v === "object" && "text" in (v as object)) {
          v = (v as { text: unknown }).text;
        }
        if (v != null && v !== "") hasValue = true;
        record[h] = v;
      });
      if (hasValue) rows.push(record);
    });
    return { headers: headers.filter(Boolean), rows };
  }

  // CSV (also accepts .txt/.tsv content with comma delimiters).
  const records = parseCsv(data, {
    columns: true,
    skip_empty_lines: true,
    trim: true,
    bom: true,
    relax_column_count: true,
  }) as Record<string, unknown>[];
  const headers = records.length > 0 ? Object.keys(records[0]) : [];
  if (headers.length === 0) throw new ServiceError("No columns detected.");
  return { headers, rows: records };
}

/** Guess an initial mapping from header names (admin can adjust). */
export function autoMap(headers: string[]): Record<string, ImportFieldKey> {
  const aliases: Record<string, ImportFieldKey> = {
    "external id": "externalId",
    externalid: "externalId",
    id: "externalId",
    ref: "externalId",
    title: "title",
    name: "title",
    summary: "title",
    description: "description",
    details: "description",
    status: "status",
    state: "status",
    priority: "priority",
    "work type": "workType",
    type: "workType",
    site: "site",
    facility: "site",
    location: "location",
    area: "location",
    asset: "asset",
    equipment: "asset",
    "assigned to": "assignedUser",
    assignee: "assignedUser",
    technician: "assignedUser",
    team: "assignedTeam",
    requester: "requester",
    "requested by": "requester",
    created: "createdDate",
    "created date": "createdDate",
    "planned start": "plannedStart",
    "start date": "plannedStart",
    due: "dueDate",
    "due date": "dueDate",
    deadline: "dueDate",
    completed: "completionDate",
    "completion date": "completionDate",
    "completed date": "completionDate",
    "estimated minutes": "estimatedMinutes",
    estimate: "estimatedMinutes",
    "actual minutes": "actualMinutes",
    "labor minutes": "actualMinutes",
    "planned downtime": "plannedDowntimeMinutes",
    "actual downtime": "actualDowntimeMinutes",
    tags: "tags",
    categories: "tags",
    "completion notes": "completionNotes",
    notes: "completionNotes",
  };
  const out: Record<string, ImportFieldKey> = {};
  for (const h of headers) {
    const k = aliases[h.trim().toLowerCase()];
    if (k) out[h] = k;
  }
  return out;
}

// ---------------------------------------------------------------------------
// Job lifecycle
// ---------------------------------------------------------------------------

export async function getJob(id: number): Promise<ImportJobRow | null> {
  const rows = await db
    .select()
    .from(importJobs)
    .where(eq(importJobs.id, id))
    .limit(1);
  return rows[0] ?? null;
}

export async function listJobs() {
  return db
    .select({ job: importJobs, userName: users.displayName })
    .from(importJobs)
    .innerJoin(users, eq(importJobs.createdBy, users.id))
    .orderBy(sql`${importJobs.createdAt} DESC`)
    .limit(100);
}

export async function listMappingTemplates() {
  return db.select().from(importMappings).orderBy(asc(importMappings.name));
}

export async function saveMappingTemplate(
  actorId: number,
  name: string,
  mapping: Record<string, string>,
): Promise<void> {
  await db
    .insert(importMappings)
    .values({ name, mapping, createdBy: actorId })
    .onConflictDoUpdate({
      target: importMappings.name,
      set: { mapping },
    });
}

type Lookups = {
  sitesByName: Map<string, { id: number; isActive: boolean }>;
  locationsBySiteAndName: Map<string, { id: number; isActive: boolean }>;
  assetsByKey: Map<string, { id: number; siteId: number; archived: boolean }>;
  usersByName: Map<string, { id: number; isActive: boolean }>;
  teamsByName: Map<string, { id: number; isActive: boolean }>;
  existingExternalIds: Set<string>;
};

async function buildLookups(): Promise<Lookups> {
  const [siteRows, locationRows, assetRows, userRows, teamRows, woRows] =
    await Promise.all([
      db.select().from(sites),
      db.select().from(locations),
      db.select().from(assets),
      db.select().from(users),
      db.select().from(teams),
      db
        .select({ externalId: workOrders.externalId })
        .from(workOrders)
        .where(sql`${workOrders.externalId} IS NOT NULL`),
    ]);
  const sitesByName = new Map<string, { id: number; isActive: boolean }>();
  for (const s of siteRows) {
    sitesByName.set(s.name.toLowerCase(), { id: s.id, isActive: s.isActive });
    if (s.code) sitesByName.set(s.code.toLowerCase(), { id: s.id, isActive: s.isActive });
  }
  const locationsBySiteAndName = new Map<string, { id: number; isActive: boolean }>();
  for (const l of locationRows) {
    locationsBySiteAndName.set(`${l.siteId}:${l.name.toLowerCase()}`, {
      id: l.id,
      isActive: l.isActive,
    });
    if (l.code) {
      locationsBySiteAndName.set(`${l.siteId}:${l.code.toLowerCase()}`, {
        id: l.id,
        isActive: l.isActive,
      });
    }
  }
  const assetsByKey = new Map<string, { id: number; siteId: number; archived: boolean }>();
  for (const a of assetRows) {
    const v = { id: a.id, siteId: a.siteId, archived: a.archivedAt != null };
    assetsByKey.set(a.assetNumber.toLowerCase(), v);
    assetsByKey.set(a.name.toLowerCase(), v);
  }
  const usersByName = new Map<string, { id: number; isActive: boolean }>();
  for (const u of userRows) {
    usersByName.set(u.username.toLowerCase(), { id: u.id, isActive: u.isActive });
    usersByName.set(u.displayName.toLowerCase(), { id: u.id, isActive: u.isActive });
  }
  const teamsByName = new Map<string, { id: number; isActive: boolean }>();
  for (const t of teamRows) {
    teamsByName.set(t.name.toLowerCase(), { id: t.id, isActive: t.isActive });
  }
  return {
    sitesByName,
    locationsBySiteAndName,
    assetsByKey,
    usersByName,
    teamsByName,
    existingExternalIds: new Set(
      woRows.map((w) => w.externalId!).filter(Boolean),
    ),
  };
}

export type ValidatedRow = {
  rowNumber: number;
  raw: Record<string, unknown>;
  status: "valid" | "warning" | "error";
  messages: string[];
  parsed: Record<string, unknown> | null;
};

/**
 * Whole-file validation (§12). Runs in memory against preloaded lookup maps
 * so 10k rows validate in seconds; nothing is guessed — ambiguous values are
 * errors, risky ones are warnings.
 */
export async function validateJob(
  actorId: number,
  jobId: number,
  mapping: Record<string, string>,
  strategy: "skip" | "update" | "new",
  fileData: Buffer,
): Promise<{ valid: number; warning: number; error: number; total: number }> {
  const job = await getJob(jobId);
  if (!job) throw new ServiceError("Import not found.");
  const mappedFields = new Set(Object.values(mapping));
  if (!mappedFields.has("title")) {
    throw new ServiceError("Map a column to Title — it is required.");
  }
  const { rows } = await parseImportFile(job.filename, fileData);
  if (rows.length === 0) throw new ServiceError("The file has no data rows.");
  const lookups = await buildLookups();
  const seenExternalIds = new Map<string, number>();
  const validated: ValidatedRow[] = [];

  rows.forEach((raw, i) => {
    const rowNumber = i + 2; // header = row 1
    const messages: string[] = [];
    let level: "valid" | "warning" | "error" = "valid";
    const warn = (m: string) => {
      messages.push(m);
      if (level === "valid") level = "warning";
    };
    const fail = (m: string) => {
      messages.push(m);
      level = "error";
    };

    const get = (field: ImportFieldKey): unknown => {
      const col = Object.keys(mapping).find((c) => mapping[c] === field);
      return col ? raw[col] : undefined;
    };
    const getText = (field: ImportFieldKey, max: number): string | null => {
      const { value, dangerous } = sanitizeText(get(field));
      if (!value) return null;
      if (dangerous) {
        warn(`${field}: looks like a spreadsheet formula — imported as plain text`);
      }
      if (value.length > max) {
        fail(`${field}: longer than ${max} characters`);
        return value.slice(0, max);
      }
      return value;
    };

    const parsed: Record<string, unknown> = {};

    const title = getText("title", 300);
    if (!title) fail("title: required and missing");
    parsed.title = title;
    parsed.description = getText("description", 10000);
    parsed.completionNotes = getText("completionNotes", 10000);

    const externalId = getText("externalId", 100);
    parsed.externalId = externalId;
    if (externalId) {
      const firstSeen = seenExternalIds.get(externalId);
      if (firstSeen != null) {
        fail(`externalId "${externalId}" duplicates row ${firstSeen} in this file`);
      } else {
        seenExternalIds.set(externalId, rowNumber);
      }
      if (lookups.existingExternalIds.has(externalId)) {
        if (strategy === "skip") warn(`externalId exists — row will be skipped`);
        else if (strategy === "update") warn(`externalId exists — work order will be updated`);
        else warn(`externalId exists — importing anyway as a new work order`);
      }
    } else if (strategy !== "new") {
      warn("no externalId — duplicate detection cannot apply to this row");
    }

    const rawStatus = sanitizeText(get("status")).value;
    if (rawStatus) {
      const s = normalizeStatus(rawStatus);
      if (!s) fail(`status "${rawStatus}" is not recognized`);
      parsed.status = s ?? undefined;
    } else {
      parsed.status = "open";
    }

    const rawPriority = sanitizeText(get("priority")).value;
    if (rawPriority) {
      const p = normalizePriority(rawPriority);
      if (!p) fail(`priority "${rawPriority}" is not recognized`);
      parsed.priority = p ?? undefined;
    } else {
      parsed.priority = "medium";
    }

    const rawType = sanitizeText(get("workType")).value;
    if (rawType) {
      const t = normalizeType(rawType);
      if (!t) fail(`work type "${rawType}" is not recognized`);
      parsed.workType = t ?? undefined;
    } else {
      parsed.workType = "reactive";
    }

    // Site is required (every WO belongs to a site).
    const rawSite = sanitizeText(get("site")).value;
    let siteId: number | null = null;
    if (!rawSite) {
      fail("site: required and missing");
    } else {
      const site = lookups.sitesByName.get(rawSite.toLowerCase());
      if (!site) fail(`site "${rawSite}" does not exist`);
      else {
        if (!site.isActive) warn(`site "${rawSite}" is archived`);
        siteId = site.id;
      }
    }
    parsed.siteId = siteId;

    const rawLocation = sanitizeText(get("location")).value;
    if (rawLocation && siteId != null) {
      const loc = lookups.locationsBySiteAndName.get(
        `${siteId}:${rawLocation.toLowerCase()}`,
      );
      if (!loc) fail(`location "${rawLocation}" not found at that site`);
      else {
        if (!loc.isActive) warn(`location "${rawLocation}" is archived`);
        parsed.locationId = loc.id;
      }
    }

    const rawAsset = sanitizeText(get("asset")).value;
    if (rawAsset) {
      const asset = lookups.assetsByKey.get(rawAsset.toLowerCase());
      if (!asset) fail(`asset "${rawAsset}" does not exist`);
      else {
        if (siteId != null && asset.siteId !== siteId) {
          fail(`asset "${rawAsset}" is at a different site`);
        }
        if (asset.archived) warn(`asset "${rawAsset}" is archived`);
        parsed.assetId = asset.id;
      }
    }

    const rawUser = sanitizeText(get("assignedUser")).value;
    if (rawUser) {
      const u = lookups.usersByName.get(rawUser.toLowerCase());
      if (!u) fail(`assigned user "${rawUser}" does not exist`);
      else {
        if (!u.isActive) warn(`assigned user "${rawUser}" is deactivated`);
        parsed.assignedUserId = u.id;
      }
    }
    const rawTeam = sanitizeText(get("assignedTeam")).value;
    if (rawTeam) {
      const t = lookups.teamsByName.get(rawTeam.toLowerCase());
      if (!t) fail(`team "${rawTeam}" does not exist`);
      else parsed.assignedTeamId = t.id;
    }
    const rawRequester = sanitizeText(get("requester")).value;
    if (rawRequester) {
      const u = lookups.usersByName.get(rawRequester.toLowerCase());
      if (!u) warn(`requester "${rawRequester}" does not exist — left blank`);
      else parsed.requesterId = u.id;
    }

    const dates: Partial<Record<"createdDate" | "plannedStart" | "dueDate" | "completionDate", Date>> = {};
    for (const f of ["createdDate", "plannedStart", "dueDate", "completionDate"] as const) {
      const v = get(f);
      if (v == null || v === "") continue;
      const d = parseImportDate(v);
      if (!d) fail(`${f}: "${String(v)}" is not a recognizable date`);
      else dates[f] = d;
    }
    if (dates.plannedStart && dates.dueDate && dates.plannedStart > dates.dueDate) {
      warn("planned start is after the due date");
    }
    if (dates.completionDate && parsed.status !== "completed" && parsed.status !== "canceled") {
      fail("completion date present but status is not completed/canceled");
    }
    if (parsed.status === "completed" && !dates.completionDate) {
      warn("status is completed but no completion date — using the due/created date");
    }
    Object.assign(parsed, dates);

    for (const f of [
      "estimatedMinutes",
      "actualMinutes",
      "plannedDowntimeMinutes",
      "actualDowntimeMinutes",
    ] as const) {
      const v = sanitizeText(get(f)).value;
      if (!v) continue;
      const n = Number(v);
      if (!Number.isFinite(n) || n < 0 || n > 1000000) {
        fail(`${f}: "${v}" is not a valid number of minutes`);
      } else {
        parsed[f] = Math.round(n);
      }
    }

    const rawTags = sanitizeText(get("tags")).value;
    if (rawTags) {
      parsed.tags = rawTags
        .split(/[,;]/)
        .map((t) => t.trim())
        .filter(Boolean)
        .slice(0, 20);
    }

    // (cast: TS can't see the closure mutations of `level` above)
    const finalLevel = level as "valid" | "warning" | "error";
    validated.push({
      rowNumber,
      raw,
      status: finalLevel,
      messages,
      parsed: finalLevel === "error" ? null : parsed,
    });
  });

  // Persist rows (batched) + update the job.
  await db.delete(importRows).where(eq(importRows.jobId, jobId));
  for (let i = 0; i < validated.length; i += 500) {
    const batch = validated.slice(i, i + 500);
    await db.insert(importRows).values(
      batch.map((r) => ({
        jobId,
        rowNumber: r.rowNumber,
        raw: { ...r.raw, __parsed: r.parsed } as object,
        status: r.status,
        messages: r.messages.length > 0 ? r.messages : null,
      })),
    );
  }
  const counts = {
    valid: validated.filter((r) => r.status === "valid").length,
    warning: validated.filter((r) => r.status === "warning").length,
    error: validated.filter((r) => r.status === "error").length,
    total: validated.length,
  };
  await db
    .update(importJobs)
    .set({
      status: "validated",
      mapping,
      strategy,
      totalRows: counts.total,
      validRows: counts.valid,
      warningRows: counts.warning,
      errorRows: counts.error,
      processedRows: 0,
      createdCount: 0,
      updatedCount: 0,
      skippedCount: 0,
      failedCount: 0,
    })
    .where(eq(importJobs.id, jobId));
  await recordAudit(db, {
    userId: actorId,
    action: "import.validated",
    entityType: "import_job",
    entityId: jobId,
    summary: `Validated ${counts.total} rows: ${counts.valid} valid, ${counts.warning} warnings, ${counts.error} errors`,
    correlationId: `import-${jobId}`,
  });
  return counts;
}

async function nextWoNumberBlock(count: number): Promise<number> {
  // Reserve a numbering block by reading the current max once.
  const rows = await db
    .select({ n: sql<string>`max(substring(${workOrders.woNumber} from '^WO-(\\d+)$'))` })
    .from(workOrders);
  return rows[0]?.n ? parseInt(rows[0].n, 10) + 1 : 1;
  void count;
}

/**
 * Background processing (§12). Claims the job atomically (validated →
 * running) so the web process and worker can both attempt it safely;
 * re-running a completed job is a no-op. Row outcomes are persisted
 * per-row, so a crash resumes without duplicating (rows already marked
 * imported/updated/skipped are not reprocessed).
 */
export async function processImportJob(jobId: number): Promise<void> {
  const claimed = await db
    .update(importJobs)
    .set({ status: "running", startedAt: new Date() })
    .where(and(eq(importJobs.id, jobId), eq(importJobs.status, "validated")))
    .returning({ id: importJobs.id });
  if (claimed.length === 0) return;

  const job = (await getJob(jobId))!;
  const strategy = job.strategy;
  const pending = await db
    .select()
    .from(importRows)
    .where(
      and(
        eq(importRows.jobId, jobId),
        inArray(importRows.status, ["valid", "warning"]),
      ),
    )
    .orderBy(asc(importRows.rowNumber));

  let woCounter = await nextWoNumberBlock(pending.length);
  let created = 0;
  let updated = 0;
  let skipped = 0;
  let failed = 0;
  let processed = 0;

  for (const row of pending) {
    const parsed = (row.raw as { __parsed?: Record<string, unknown> }).__parsed;
    // Dates round-trip through JSONB as ISO strings — rehydrate them.
    if (parsed) {
      for (const f of ["createdDate", "plannedStart", "dueDate", "completionDate"]) {
        if (typeof parsed[f] === "string") parsed[f] = new Date(parsed[f] as string);
      }
    }
    if (!parsed) {
      failed += 1;
      processed += 1;
      continue;
    }
    try {
      const externalId = (parsed.externalId as string | null) ?? null;
      let existingId: number | null = null;
      if (externalId && strategy !== "new") {
        const [existing] = await db
          .select({ id: workOrders.id })
          .from(workOrders)
          .where(eq(workOrders.externalId, externalId))
          .limit(1);
        existingId = existing?.id ?? null;
      }

      if (existingId && strategy === "skip") {
        await db
          .update(importRows)
          .set({ status: "skipped", workOrderId: existingId })
          .where(eq(importRows.id, row.id));
        skipped += 1;
      } else if (existingId && strategy === "update") {
        await updateFromRow(existingId, parsed);
        await db
          .update(importRows)
          .set({ status: "updated", workOrderId: existingId })
          .where(eq(importRows.id, row.id));
        updated += 1;
      } else {
        const woId = await createFromRow(job, parsed, `WO-${String(woCounter).padStart(4, "0")}`, strategy);
        woCounter += 1;
        await db
          .update(importRows)
          .set({ status: "imported", workOrderId: woId })
          .where(eq(importRows.id, row.id));
        created += 1;
      }
    } catch (err) {
      failed += 1;
      await db
        .update(importRows)
        .set({
          status: "failed",
          messages: [
            ...(row.messages ?? []),
            `import failed: ${err instanceof Error ? err.message : String(err)}`,
          ],
        })
        .where(eq(importRows.id, row.id));
    }
    processed += 1;
    if (processed % 100 === 0) {
      await db
        .update(importJobs)
        .set({ processedRows: processed, createdCount: created, updatedCount: updated, skippedCount: skipped, failedCount: failed })
        .where(eq(importJobs.id, jobId));
    }
  }

  await db
    .update(importJobs)
    .set({
      status: "completed",
      processedRows: processed,
      createdCount: created,
      updatedCount: updated,
      skippedCount: skipped,
      failedCount: failed,
      finishedAt: new Date(),
    })
    .where(eq(importJobs.id, jobId));
  await recordAudit(db, {
    userId: job.createdBy,
    action: "import.completed",
    entityType: "import_job",
    entityId: jobId,
    summary: `Imported ${created} new, ${updated} updated, ${skipped} skipped, ${failed} failed`,
    source: "import",
    correlationId: `import-${jobId}`,
  });
}

async function createFromRow(
  job: ImportJobRow,
  parsed: Record<string, unknown>,
  woNumber: string,
  strategy: string,
): Promise<number> {
  return db.transaction(async (tx) => {
    const status = parsed.status as
      | "draft" | "open" | "assigned" | "in_progress" | "paused" | "on_hold"
      | "waiting" | "waiting_approval" | "completed" | "canceled";
    const completedAt =
      status === "completed"
        ? ((parsed.completionDate as Date | undefined) ??
          (parsed.dueDate as Date | undefined) ??
          (parsed.createdDate as Date | undefined) ??
          new Date())
        : null;
    const [wo] = await tx
      .insert(workOrders)
      .values({
        woNumber,
        title: parsed.title as string,
        description: (parsed.description as string | null) ?? null,
        siteId: parsed.siteId as number,
        locationId: (parsed.locationId as number | undefined) ?? null,
        workType: (parsed.workType ?? "reactive") as "reactive",
        priority: (parsed.priority ?? "medium") as "medium",
        status,
        tags: (parsed.tags as string[] | undefined) ?? null,
        assignedTeamId: (parsed.assignedTeamId as number | undefined) ?? null,
        requesterId: (parsed.requesterId as number | undefined) ?? null,
        plannedStartAt: (parsed.plannedStart as Date | undefined) ?? null,
        dueAt: (parsed.dueDate as Date | undefined) ?? null,
        completedAt,
        estimatedMinutes: (parsed.estimatedMinutes as number | undefined) ?? null,
        plannedDowntimeMinutes:
          (parsed.plannedDowntimeMinutes as number | undefined) ?? null,
        actualDowntimeMinutes:
          (parsed.actualDowntimeMinutes as number | undefined) ?? null,
        completionNotes: (parsed.completionNotes as string | null) ?? null,
        source: "import",
        // "new" strategy on an existing external id must not violate the
        // unique index — the duplicate keeps NO external id in that case.
        externalId:
          strategy === "new" ? null : ((parsed.externalId as string | null) ?? null),
        createdBy: job.createdBy,
        ...(parsed.createdDate ? { createdAt: parsed.createdDate as Date } : {}),
      })
      .returning({ id: workOrders.id });

    if (parsed.assetId) {
      await tx.insert(workOrderAssets).values({
        workOrderId: wo.id,
        assetId: parsed.assetId as number,
        isPrimary: true,
      });
    }
    if (parsed.assignedUserId) {
      await tx.insert(workOrderAssignments).values({
        workOrderId: wo.id,
        userId: parsed.assignedUserId as number,
        assignedBy: job.createdBy,
      });
    }
    if (parsed.actualMinutes) {
      await tx.insert(workOrderLabor).values({
        workOrderId: wo.id,
        userId: (parsed.assignedUserId as number | undefined) ?? job.createdBy,
        minutes: parsed.actualMinutes as number,
        note: "Imported labor total",
      });
    }
    await tx.insert(workOrderStatusHistory).values({
      workOrderId: wo.id,
      status,
      previousStatus: null,
      changedBy: job.createdBy,
      note: `Imported (job #${job.id})`,
    });
    return wo.id;
  });
}

async function updateFromRow(
  workOrderId: number,
  parsed: Record<string, unknown>,
): Promise<void> {
  await db.transaction(async (tx) => {
    const status = parsed.status as "open" | "completed";
    await tx
      .update(workOrders)
      .set({
        title: parsed.title as string,
        description: (parsed.description as string | null) ?? null,
        status,
        priority: (parsed.priority ?? "medium") as "medium",
        workType: (parsed.workType ?? "reactive") as "reactive",
        plannedStartAt: (parsed.plannedStart as Date | undefined) ?? null,
        dueAt: (parsed.dueDate as Date | undefined) ?? null,
        completedAt:
          status === "completed"
            ? ((parsed.completionDate as Date | undefined) ?? new Date())
            : null,
        estimatedMinutes: (parsed.estimatedMinutes as number | undefined) ?? null,
        completionNotes: (parsed.completionNotes as string | null) ?? null,
        updatedAt: new Date(),
      })
      .where(eq(workOrders.id, workOrderId));
  });
}

/**
 * Rollback (§12), only where safe: removes ONLY work orders this import
 * CREATED that have not been touched since (no comments, labor beyond the
 * imported total, attachments, or status changes). Touched rows are left in
 * place and reported.
 */
export async function rollbackImport(
  actorId: number,
  jobId: number,
): Promise<{ removed: number; kept: number }> {
  const job = await getJob(jobId);
  if (!job) throw new ServiceError("Import not found.");
  if (job.status !== "completed") {
    throw new ServiceError("Only completed imports can be rolled back.");
  }
  const rows = await db
    .select()
    .from(importRows)
    .where(and(eq(importRows.jobId, jobId), eq(importRows.status, "imported")));
  let removed = 0;
  let kept = 0;
  for (const row of rows) {
    if (!row.workOrderId) continue;
    const woId = row.workOrderId;
    const [history, commentRows, laborRows] = await Promise.all([
      db
        .select({ count: sql<number>`count(*)::int` })
        .from(workOrderStatusHistory)
        .where(eq(workOrderStatusHistory.workOrderId, woId)),
      db
        .select({ count: sql<number>`count(*)::int` })
        .from(comments)
        .where(and(eq(comments.entityType, "work_order"), eq(comments.entityId, woId))),
      db
        .select({ count: sql<number>`count(*)::int` })
        .from(workOrderLabor)
        .where(
          and(
            eq(workOrderLabor.workOrderId, woId),
            sql`${workOrderLabor.note} IS DISTINCT FROM 'Imported labor total'`,
          ),
        ),
    ]);
    const touched =
      history[0].count > 1 || commentRows[0].count > 0 || laborRows[0].count > 0;
    if (touched) {
      kept += 1;
      continue;
    }
    await db.transaction(async (tx) => {
      await tx
        .update(importRows)
        .set({ status: "rolled_back", workOrderId: null })
        .where(eq(importRows.id, row.id));
      await tx.delete(workOrders).where(eq(workOrders.id, woId));
    });
    removed += 1;
  }
  await db
    .update(importJobs)
    .set({ status: "rolled_back", finishedAt: new Date() })
    .where(eq(importJobs.id, jobId));
  await recordAudit(db, {
    userId: actorId,
    action: "import.rolled_back",
    entityType: "import_job",
    entityId: jobId,
    summary: `Rolled back: ${removed} removed, ${kept} kept (modified since import)`,
    correlationId: `import-${jobId}`,
  });
  return { removed, kept };
}

/** Error/warning rows as CSV for download (§12). */
export async function rowIssuesCsv(jobId: number): Promise<string> {
  const rows = await db
    .select()
    .from(importRows)
    .where(
      and(
        eq(importRows.jobId, jobId),
        inArray(importRows.status, ["error", "warning", "failed"]),
      ),
    )
    .orderBy(asc(importRows.rowNumber));
  const esc = (v: unknown) => {
    let s = String(v ?? "");
    if (/^[=+\-@]/.test(s)) s = `'${s}`;
    if (/[",\n]/.test(s)) s = `"${s.replaceAll('"', '""')}"`;
    return s;
  };
  const lines = ["row,status,messages,raw"];
  for (const r of rows) {
    const raw = { ...(r.raw as Record<string, unknown>) };
    delete raw.__parsed;
    lines.push(
      [r.rowNumber, r.status, (r.messages ?? []).join(" | "), JSON.stringify(raw)]
        .map(esc)
        .join(","),
    );
  }
  return lines.join("\n");
}
