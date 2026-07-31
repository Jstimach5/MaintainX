import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
import { assertRole, AuthError } from "@/server/auth/guards";
import {
  completedByTechnician,
  downtimeByAsset,
  woCountsByPriority,
  woCountsByStatus,
  woCountsByType,
  type ReportFilters,
} from "@/server/services/reports";
import { listWorkOrders } from "@/server/services/workOrders";

/**
 * CSV export (§13). Cells are quoted and formula-injection-sanitized: values
 * starting with = + - @ are prefixed with ' so a spreadsheet never executes
 * imported content (§12 dangerous-content rule, applied on the way out too).
 */
function csvCell(v: unknown): string {
  let s = v == null ? "" : String(v);
  if (/^[=+\-@]/.test(s)) s = `'${s}`;
  if (/[",\n]/.test(s)) s = `"${s.replaceAll('"', '""')}"`;
  return s;
}

function toCsv(headers: string[], rows: unknown[][]): string {
  return [
    headers.map(csvCell).join(","),
    ...rows.map((r) => r.map(csvCell).join(",")),
  ].join("\n");
}

export async function GET(request: Request): Promise<Response> {
  try {
    await assertRole("admin", "manager");
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    throw err;
  }

  const url = new URL(request.url);
  const filters: ReportFilters = {};
  const from = url.searchParams.get("from");
  const to = url.searchParams.get("to");
  const site = url.searchParams.get("site");
  if (from && /^\d{4}-\d{2}-\d{2}$/.test(from)) {
    filters.from = new Date(`${from}T00:00:00Z`);
  }
  if (to && /^\d{4}-\d{2}-\d{2}$/.test(to)) {
    filters.to = new Date(`${to}T23:59:59Z`);
  }
  if (site && Number.isInteger(Number(site))) filters.siteId = Number(site);

  const [byStatus, byPriority, byType, byTech, downtime, wos] =
    await Promise.all([
      woCountsByStatus(filters),
      woCountsByPriority(filters),
      woCountsByType(filters),
      completedByTechnician(filters),
      downtimeByAsset(filters),
      listWorkOrders({ includeDone: true, siteId: filters.siteId }),
    ]);

  const sections = [
    "# Work orders by status",
    toCsv(["status", "count"], byStatus.map((r) => [r.key, r.count])),
    "",
    "# Work orders by priority",
    toCsv(["priority", "count"], byPriority.map((r) => [r.key, r.count])),
    "",
    "# Work orders by type",
    toCsv(["type", "count"], byType.map((r) => [r.key, r.count])),
    "",
    "# Completed by technician",
    toCsv(
      ["technician", "completed", "labor_minutes"],
      byTech.map((r) => [r.name, r.completed, r.laborMinutes]),
    ),
    "",
    "# Downtime by asset",
    toCsv(
      ["asset", "planned_minutes", "actual_minutes", "work_orders"],
      downtime.map((d) => [
        `${d.assetNumber} ${d.assetName}`,
        d.plannedMinutes,
        d.actualMinutes,
        d.workOrderCount,
      ]),
    ),
    "",
    "# Work orders (raw)",
    toCsv(
      ["number", "title", "status", "priority", "type", "site", "assignees", "due", "completed"],
      wos.map((r) => [
        r.wo.woNumber,
        r.wo.title,
        r.wo.status,
        r.wo.priority,
        r.wo.workType,
        r.siteName,
        r.assignees.join("; "),
        r.wo.dueAt?.toISOString() ?? "",
        r.wo.completedAt?.toISOString() ?? "",
      ]),
    ),
  ].join("\n");

  return new Response(sections, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="maintenance-report.csv"`,
    },
  });
}
