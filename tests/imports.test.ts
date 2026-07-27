import { beforeEach, describe, expect, it } from "vitest";
import { and, eq, sql } from "drizzle-orm";
import { db } from "@/server/db";
import { importJobs, importRows, workOrders } from "@/server/db/schema";
import { createSite } from "@/server/services/sites";
import { createAsset } from "@/server/services/assets";
import {
  autoMap,
  getJob,
  normalizePriority,
  normalizeStatus,
  parseImportDate,
  parseImportFile,
  processImportJob,
  rollbackImport,
  rowIssuesCsv,
  validateJob,
} from "@/server/services/imports";
import { addComment } from "@/server/services/workOrders";
import { makeUser, truncateAll } from "./helpers";
import type { SessionUser } from "@/server/auth/session";

async function reset() {
  await truncateAll();
  await db.execute(sql`
    TRUNCATE TABLE import_rows, import_jobs, import_mappings,
      meter_trigger_events, meter_triggers, meter_readings, meters,
      pm_occurrences, pm_plans, notifications, work_requests,
      procedure_responses, wo_procedure_instances, procedure_versions,
      procedure_templates, comments, work_order_labor,
      work_order_status_history, work_order_assignments, work_order_assets,
      work_orders, assets, locations, sites RESTART IDENTITY CASCADE
  `);
}

function asSession(u: { id: number; username: string; role: SessionUser["role"] }): SessionUser {
  return { id: u.id, username: u.username, displayName: u.username, email: null, role: u.role };
}

let admin: SessionUser;

async function makeJob(csv: string, filename = "import.csv"): Promise<{ jobId: number; data: Buffer }> {
  const data = Buffer.from(csv);
  const { headers } = await parseImportFile(filename, data);
  const [job] = await db
    .insert(importJobs)
    .values({
      filename,
      storedName: "n/a",
      headers,
      createdBy: admin.id,
    })
    .returning({ id: importJobs.id });
  return { jobId: job.id, data };
}

const MAPPING = {
  "External ID": "externalId",
  Title: "title",
  Status: "status",
  Priority: "priority",
  Site: "site",
  Asset: "asset",
  Due: "dueDate",
  Completed: "completionDate",
};

beforeEach(async () => {
  await reset();
  admin = asSession(await makeUser({ role: "admin" }));
  const siteId = await createSite(admin.id, { name: "Main", code: "MAIN" });
  await createAsset(admin.id, { name: "Pump", siteId, criticality: "medium" });
});

describe("normalization and parsing", () => {
  it("normalizes status/priority variants; ambiguity is null", () => {
    expect(normalizeStatus("Done")).toBe("completed");
    expect(normalizeStatus("IN PROGRESS")).toBe("in_progress");
    expect(normalizeStatus("cancelled")).toBe("canceled");
    expect(normalizeStatus("whatever")).toBeNull();
    expect(normalizePriority("Urgent")).toBe("critical");
    expect(normalizePriority("med")).toBe("medium");
    expect(normalizePriority("p1")).toBeNull();
  });

  it("parses ISO and US dates; rejects garbage", () => {
    expect(parseImportDate("2026-07-01")?.toISOString()).toContain("2026-07-01");
    expect(parseImportDate("7/1/2026")?.toISOString()).toContain("2026-07-01");
    expect(parseImportDate("not a date")).toBeNull();
  });

  it("auto-maps common headers", () => {
    const m = autoMap(["Title", "Due Date", "Assignee", "External ID"]);
    expect(m["Title"]).toBe("title");
    expect(m["Due Date"]).toBe("dueDate");
    expect(m["Assignee"]).toBe("assignedUser");
    expect(m["External ID"]).toBe("externalId");
  });

  it("parses CSV files with headers", async () => {
    const { headers, rows } = await parseImportFile(
      "x.csv",
      Buffer.from("Title,Site\nFix door,Main\n"),
    );
    expect(headers).toEqual(["Title", "Site"]);
    expect(rows).toHaveLength(1);
  });
});

describe("validation (§12)", () => {
  it("separates valid, warning, and error rows without guessing", async () => {
    const csv = [
      "External ID,Title,Status,Priority,Site,Asset,Due,Completed",
      "T-1,Fix pump,done,high,Main,Pump,2026-07-01,2026-07-02", // valid
      "T-2,No such site,open,low,Nowhere,,,", // error: site
      "T-3,Ambiguous,sorta-done,low,Main,,,", // error: status
      "T-4,=SUM(A1),open,low,Main,,,", // warning: formula-ish title
      ",,open,low,Main,,,", // error: missing title (and no ext-id)
      "T-6,Contradiction,open,low,Main,,,2026-07-01", // error: completed date on open
    ].join("\n").replace("T-4,=SUM(A1)", 'T-4,"=SUM(A1)"');
    const { jobId, data } = await makeJob(csv);
    const counts = await validateJob(admin.id, jobId, MAPPING, "skip", data);
    expect(counts.total).toBe(6);
    expect(counts.error).toBe(4); // no-site, bad-status, no-title, contradiction
    expect(counts.warning).toBe(1); // formula title
    expect(counts.valid).toBe(1);

    const csvOut = await rowIssuesCsv(jobId);
    expect(csvOut).toContain("does not exist");
    expect(csvOut).toContain("not recognized");
  });

  it("rejects in-file duplicate external ids", async () => {
    const csv = [
      "External ID,Title,Status,Priority,Site,Asset,Due,Completed",
      "DUP,First,open,low,Main,,,",
      "DUP,Second,open,low,Main,,,",
    ].join("\n");
    const { jobId, data } = await makeJob(csv);
    const counts = await validateJob(admin.id, jobId, MAPPING, "skip", data);
    expect(counts.error).toBe(1);
  });

  it("requires a title mapping", async () => {
    const { jobId, data } = await makeJob("A,B\n1,2\n");
    await expect(
      validateJob(admin.id, jobId, { A: "externalId" }, "skip", data),
    ).rejects.toThrow(/title/i);
  });
});

describe("processing + idempotency (Scenario D)", () => {
  const CSV = [
    "External ID,Title,Status,Priority,Site,Asset,Due,Completed",
    "IMP-1,Imported open,open,high,Main,Pump,2026-08-01,",
    "IMP-2,Imported done,done,low,MAIN,,2026-06-01,2026-06-02",
  ].join("\n");

  it("imports valid rows with statuses, dates, asset links, and source=import", async () => {
    const { jobId, data } = await makeJob(CSV);
    await validateJob(admin.id, jobId, MAPPING, "skip", data);
    await processImportJob(jobId);

    const job = await getJob(jobId);
    expect(job?.status).toBe("completed");
    expect(job?.createdCount).toBe(2);

    const wos = await db.select().from(workOrders);
    expect(wos).toHaveLength(2);
    const done = wos.find((w) => w.externalId === "IMP-2");
    expect(done?.status).toBe("completed");
    expect(done?.completedAt).not.toBeNull();
    expect(done?.source).toBe("import");
    const open = wos.find((w) => w.externalId === "IMP-1");
    expect(open?.status).toBe("open");
  });

  it("re-importing with skip strategy creates no duplicates", async () => {
    const first = await makeJob(CSV);
    await validateJob(admin.id, first.jobId, MAPPING, "skip", first.data);
    await processImportJob(first.jobId);

    const second = await makeJob(CSV);
    await validateJob(admin.id, second.jobId, MAPPING, "skip", second.data);
    await processImportJob(second.jobId);

    expect(await db.select().from(workOrders)).toHaveLength(2);
    const job2 = await getJob(second.jobId);
    expect(job2?.skippedCount).toBe(2);
    expect(job2?.createdCount).toBe(0);
  });

  it("update strategy updates the existing work order in place", async () => {
    const first = await makeJob(CSV);
    await validateJob(admin.id, first.jobId, MAPPING, "skip", first.data);
    await processImportJob(first.jobId);

    const updatedCsv = CSV.replace("Imported open,open,high", "Renamed,done,high").replace(
      "IMP-1,Renamed,done,high,Main,Pump,2026-08-01,",
      "IMP-1,Renamed,done,high,Main,Pump,2026-08-01,2026-08-02",
    );
    const second = await makeJob(updatedCsv);
    await validateJob(admin.id, second.jobId, MAPPING, "update", second.data);
    await processImportJob(second.jobId);

    expect(await db.select().from(workOrders)).toHaveLength(2);
    const [wo] = await db
      .select()
      .from(workOrders)
      .where(eq(workOrders.externalId, "IMP-1"));
    expect(wo.title).toBe("Renamed");
    expect(wo.status).toBe("completed");
    expect((await getJob(second.jobId))?.updatedCount).toBe(2);
  });

  it("double-processing the same job is a no-op (atomic claim)", async () => {
    const { jobId, data } = await makeJob(CSV);
    await validateJob(admin.id, jobId, MAPPING, "skip", data);
    await Promise.all([processImportJob(jobId), processImportJob(jobId)]);
    expect(await db.select().from(workOrders)).toHaveLength(2);
  });

  it("handles 10,000 rows", async () => {
    const lines = ["External ID,Title,Status,Priority,Site,Asset,Due,Completed"];
    for (let i = 1; i <= 10000; i++) {
      lines.push(`BULK-${i},Bulk row ${i},open,medium,Main,,,`);
    }
    const { jobId, data } = await makeJob(lines.join("\n"));
    const counts = await validateJob(admin.id, jobId, MAPPING, "skip", data);
    expect(counts.valid).toBe(10000);
    await processImportJob(jobId);
    const job = await getJob(jobId);
    expect(job?.createdCount).toBe(10000);
    const [count] = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(workOrders);
    expect(count.n).toBe(10000);
  }, 120000);
});

describe("rollback (§12)", () => {
  it("removes only untouched imported WOs and reports the kept ones", async () => {
    const csv = [
      "External ID,Title,Status,Priority,Site,Asset,Due,Completed",
      "R-1,Keep me (will be touched),open,low,Main,,,",
      "R-2,Remove me,open,low,Main,,,",
    ].join("\n");
    const { jobId, data } = await makeJob(csv);
    await validateJob(admin.id, jobId, MAPPING, "skip", data);
    await processImportJob(jobId);

    const [touched] = await db
      .select()
      .from(workOrders)
      .where(eq(workOrders.externalId, "R-1"));
    await addComment(admin, "work_order", touched.id, "Human touched this");

    const result = await rollbackImport(admin.id, jobId);
    expect(result.removed).toBe(1);
    expect(result.kept).toBe(1);

    const remaining = await db.select().from(workOrders);
    expect(remaining).toHaveLength(1);
    expect(remaining[0].externalId).toBe("R-1");
    expect((await getJob(jobId))?.status).toBe("rolled_back");

    const rolledRows = await db
      .select()
      .from(importRows)
      .where(and(eq(importRows.jobId, jobId), eq(importRows.status, "rolled_back")));
    expect(rolledRows).toHaveLength(1);
  });
});
