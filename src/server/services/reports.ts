import { and, eq, gte, inArray, isNotNull, lte, sql } from "drizzle-orm";
import { db } from "@/server/db";
import {
  assets,
  meterTriggerEvents,
  pmOccurrences,
  pmPlans,
  sites,
  teams,
  users,
  workOrderAssets,
  workOrderAssignments,
  workOrderLabor,
  workOrders,
  workRequests,
} from "@/server/db/schema";

/**
 * Reporting core (§13). KPI definitions live HERE and only here, unit-tested
 * in tests/reports.test.ts:
 * - "Completed" ALWAYS means status = completed. Canceled work is never
 *   counted as completed anywhere.
 * - Completion time = completedAt − createdAt, in hours.
 * - PM compliance = completed on or before the occurrence due date ÷ all
 *   occurrences due in range (late + still-open both count against).
 * - Request response time = decidedAt − createdAt; approval rate =
 *   (approved + converted) ÷ decided.
 */
export type ReportFilters = {
  from?: Date;
  to?: Date;
  siteId?: number;
};

function woConds(f: ReportFilters) {
  const conds = [];
  if (f.from) conds.push(gte(workOrders.createdAt, f.from));
  if (f.to) conds.push(lte(workOrders.createdAt, f.to));
  if (f.siteId) conds.push(eq(workOrders.siteId, f.siteId));
  return conds;
}

export async function woCountsByStatus(f: ReportFilters = {}) {
  return db
    .select({ key: workOrders.status, count: sql<number>`count(*)::int` })
    .from(workOrders)
    .where(and(...woConds(f)))
    .groupBy(workOrders.status);
}

export async function woCountsByPriority(f: ReportFilters = {}) {
  return db
    .select({ key: workOrders.priority, count: sql<number>`count(*)::int` })
    .from(workOrders)
    .where(and(...woConds(f)))
    .groupBy(workOrders.priority);
}

export async function woCountsByType(f: ReportFilters = {}) {
  return db
    .select({ key: workOrders.workType, count: sql<number>`count(*)::int` })
    .from(workOrders)
    .where(and(...woConds(f)))
    .groupBy(workOrders.workType);
}

const OPEN_STATUSES = [
  "draft",
  "open",
  "assigned",
  "in_progress",
  "on_hold",
  "waiting",
] as const;

export async function backlog(f: ReportFilters = {}) {
  const conds = [inArray(workOrders.status, [...OPEN_STATUSES])];
  if (f.siteId) conds.push(eq(workOrders.siteId, f.siteId));
  const [row] = await db
    .select({
      open: sql<number>`count(*)::int`,
      overdue: sql<number>`count(*) FILTER (WHERE ${workOrders.dueAt} < now())::int`,
      unassigned: sql<number>`count(*) FILTER (WHERE ${workOrders.assignedTeamId} IS NULL AND NOT EXISTS (SELECT 1 FROM work_order_assignments a WHERE a.work_order_id = ${workOrders.id}))::int`,
    })
    .from(workOrders)
    .where(and(...conds));
  return row;
}

/** Completed WOs by the people who logged labor or were assigned. */
export async function completedByTechnician(f: ReportFilters = {}) {
  const conds = [eq(workOrders.status, "completed"), ...completedRange(f)];
  return db
    .select({
      userId: users.id,
      name: users.displayName,
      completed: sql<number>`count(DISTINCT ${workOrders.id})::int`,
      laborMinutes: sql<number>`coalesce(sum(${workOrderLabor.minutes}), 0)::int`,
    })
    .from(workOrders)
    .innerJoin(
      workOrderAssignments,
      eq(workOrderAssignments.workOrderId, workOrders.id),
    )
    .innerJoin(users, eq(workOrderAssignments.userId, users.id))
    .leftJoin(
      workOrderLabor,
      and(
        eq(workOrderLabor.workOrderId, workOrders.id),
        eq(workOrderLabor.userId, users.id),
      ),
    )
    .where(and(...conds))
    .groupBy(users.id, users.displayName)
    .orderBy(sql`count(DISTINCT ${workOrders.id}) DESC`);
}

function completedRange(f: ReportFilters) {
  const conds = [];
  if (f.from) conds.push(gte(workOrders.completedAt, f.from));
  if (f.to) conds.push(lte(workOrders.completedAt, f.to));
  if (f.siteId) conds.push(eq(workOrders.siteId, f.siteId));
  return conds;
}

export async function completedByTeam(f: ReportFilters = {}) {
  return db
    .select({
      teamName: teams.name,
      completed: sql<number>`count(*)::int`,
    })
    .from(workOrders)
    .innerJoin(teams, eq(workOrders.assignedTeamId, teams.id))
    .where(and(eq(workOrders.status, "completed"), ...completedRange(f)))
    .groupBy(teams.name)
    .orderBy(sql`count(*) DESC`);
}

export async function completedBySite(f: ReportFilters = {}) {
  return db
    .select({
      siteName: sites.name,
      completed: sql<number>`count(*)::int`,
    })
    .from(workOrders)
    .innerJoin(sites, eq(workOrders.siteId, sites.id))
    .where(and(eq(workOrders.status, "completed"), ...completedRange(f)))
    .groupBy(sites.name)
    .orderBy(sql`count(*) DESC`);
}

export async function completionStats(f: ReportFilters = {}) {
  const [row] = await db
    .select({
      completed: sql<number>`count(*)::int`,
      avgHours: sql<number>`coalesce(avg(EXTRACT(EPOCH FROM (${workOrders.completedAt} - ${workOrders.createdAt})) / 3600), 0)::float`,
      estimatedMinutes: sql<number>`coalesce(sum(${workOrders.estimatedMinutes}), 0)::int`,
    })
    .from(workOrders)
    .where(and(eq(workOrders.status, "completed"), ...completedRange(f)));
  const [labor] = await db
    .select({
      actualMinutes: sql<number>`coalesce(sum(${workOrderLabor.minutes}), 0)::int`,
    })
    .from(workOrderLabor)
    .innerJoin(workOrders, eq(workOrderLabor.workOrderId, workOrders.id))
    .where(and(eq(workOrders.status, "completed"), ...completedRange(f)));
  return { ...row, actualMinutes: labor.actualMinutes };
}

/** PM compliance (§13): completed on/before due ÷ occurrences due in range. */
export async function pmCompliance(f: ReportFilters = {}) {
  const conds = [];
  if (f.from) {
    conds.push(gte(pmOccurrences.occurrenceKey, f.from.toISOString().slice(0, 10)));
  }
  if (f.to) {
    conds.push(lte(pmOccurrences.occurrenceKey, f.to.toISOString().slice(0, 10)));
  }
  const rows = await db
    .select({
      occurrenceKey: pmOccurrences.occurrenceKey,
      status: workOrders.status,
      completedAt: workOrders.completedAt,
    })
    .from(pmOccurrences)
    .leftJoin(workOrders, eq(pmOccurrences.workOrderId, workOrders.id))
    .where(conds.length > 0 ? and(...conds) : undefined);
  let onTime = 0;
  let late = 0;
  let open = 0;
  for (const r of rows) {
    if (r.status === "completed" && r.completedAt) {
      // On time = completed by end of the due day (UTC day boundary is fine
      // for a compliance ratio).
      const dueEnd = new Date(`${r.occurrenceKey}T23:59:59Z`);
      if (r.completedAt <= dueEnd) onTime += 1;
      else late += 1;
    } else if (r.status === "canceled") {
      // Canceled PM neither helps nor hurts compliance.
    } else {
      open += 1;
    }
  }
  const total = onTime + late + open;
  return {
    total,
    onTime,
    late,
    open,
    complianceRate: total > 0 ? onTime / total : null,
  };
}

export async function preventiveVsReactive(f: ReportFilters = {}) {
  const rows = await woCountsByType(f);
  const preventive = rows
    .filter((r) => r.key === "preventive" || r.key === "inspection")
    .reduce((s, r) => s + r.count, 0);
  const reactive = rows
    .filter((r) => r.key === "reactive" || r.key === "corrective")
    .reduce((s, r) => s + r.count, 0);
  const other = rows.reduce((s, r) => s + r.count, 0) - preventive - reactive;
  return { preventive, reactive, other };
}

export async function downtimeByAsset(f: ReportFilters = {}) {
  return db
    .select({
      assetId: assets.id,
      assetNumber: assets.assetNumber,
      assetName: assets.name,
      plannedMinutes: sql<number>`coalesce(sum(${workOrders.plannedDowntimeMinutes}), 0)::int`,
      actualMinutes: sql<number>`coalesce(sum(${workOrders.actualDowntimeMinutes}), 0)::int`,
      workOrderCount: sql<number>`count(*)::int`,
    })
    .from(workOrders)
    .innerJoin(workOrderAssets, eq(workOrderAssets.workOrderId, workOrders.id))
    .innerJoin(assets, eq(workOrderAssets.assetId, assets.id))
    .where(
      and(
        eq(workOrders.status, "completed"),
        sql`(${workOrders.plannedDowntimeMinutes} IS NOT NULL OR ${workOrders.actualDowntimeMinutes} IS NOT NULL)`,
        ...completedRange(f),
      ),
    )
    .groupBy(assets.id, assets.assetNumber, assets.name)
    .orderBy(sql`coalesce(sum(${workOrders.actualDowntimeMinutes}), 0) DESC`);
}

/** Assets with ≥2 completed reactive/corrective WOs in range (§13). */
export async function repeatFailures(f: ReportFilters = {}) {
  return db
    .select({
      assetId: assets.id,
      assetNumber: assets.assetNumber,
      assetName: assets.name,
      failures: sql<number>`count(*)::int`,
    })
    .from(workOrders)
    .innerJoin(workOrderAssets, eq(workOrderAssets.workOrderId, workOrders.id))
    .innerJoin(assets, eq(workOrderAssets.assetId, assets.id))
    .where(
      and(
        eq(workOrders.status, "completed"),
        inArray(workOrders.workType, ["reactive", "corrective"]),
        ...completedRange(f),
      ),
    )
    .groupBy(assets.id, assets.assetNumber, assets.name)
    .having(sql`count(*) >= 2`)
    .orderBy(sql`count(*) DESC`);
}

export async function requestStats(f: ReportFilters = {}) {
  const conds = [];
  if (f.from) conds.push(gte(workRequests.createdAt, f.from));
  if (f.to) conds.push(lte(workRequests.createdAt, f.to));
  if (f.siteId) conds.push(eq(workRequests.siteId, f.siteId));
  const [row] = await db
    .select({
      total: sql<number>`count(*)::int`,
      approved: sql<number>`count(*) FILTER (WHERE ${workRequests.status} IN ('approved','converted'))::int`,
      declined: sql<number>`count(*) FILTER (WHERE ${workRequests.status} = 'declined')::int`,
      avgResponseHours: sql<number>`coalesce(avg(EXTRACT(EPOCH FROM (${workRequests.decidedAt} - ${workRequests.createdAt})) / 3600) FILTER (WHERE ${workRequests.decidedAt} IS NOT NULL), 0)::float`,
    })
    .from(workRequests)
    .where(conds.length > 0 ? and(...conds) : undefined);
  const decided = row.approved + row.declined;
  return {
    ...row,
    approvalRate: decided > 0 ? row.approved / decided : null,
  };
}

export async function meterTriggeredCount(f: ReportFilters = {}) {
  const conds = [isNotNull(meterTriggerEvents.workOrderId)];
  if (f.from) conds.push(gte(meterTriggerEvents.createdAt, f.from));
  if (f.to) conds.push(lte(meterTriggerEvents.createdAt, f.to));
  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(meterTriggerEvents)
    .where(and(...conds));
  return row.count;
}

// ---------------------------------------------------------------------------
// Manager warnings (§11)
// ---------------------------------------------------------------------------

export async function managerWarnings(today: string) {
  const openConds = inArray(workOrders.status, [...OPEN_STATUSES]);

  const scheduledPastDue = await db
    .select({ id: workOrders.id, woNumber: workOrders.woNumber, title: workOrders.title })
    .from(workOrders)
    .where(
      and(
        openConds,
        isNotNull(workOrders.plannedStartAt),
        isNotNull(workOrders.dueAt),
        sql`${workOrders.plannedStartAt} > ${workOrders.dueAt}`,
      ),
    )
    .limit(20);

  const archivedAssetWork = await db
    .select({
      id: workOrders.id,
      woNumber: workOrders.woNumber,
      title: workOrders.title,
      assetNumber: assets.assetNumber,
    })
    .from(workOrders)
    .innerJoin(workOrderAssets, eq(workOrderAssets.workOrderId, workOrders.id))
    .innerJoin(assets, eq(workOrderAssets.assetId, assets.id))
    .where(and(openConds, isNotNull(assets.archivedAt)))
    .limit(20);

  const inactiveAssignee = await db
    .select({
      id: workOrders.id,
      woNumber: workOrders.woNumber,
      title: workOrders.title,
      userName: users.displayName,
    })
    .from(workOrders)
    .innerJoin(
      workOrderAssignments,
      eq(workOrderAssignments.workOrderId, workOrders.id),
    )
    .innerJoin(users, eq(workOrderAssignments.userId, users.id))
    .where(and(openConds, eq(users.isActive, false)))
    .limit(20);

  const overduePm = await db
    .select({ id: pmPlans.id, name: pmPlans.name, nextDue: pmPlans.nextDue })
    .from(pmPlans)
    .where(and(eq(pmPlans.isPaused, false), sql`${pmPlans.nextDue} < ${today}`))
    .limit(20);

  // Asset still offline after its latest WO completed (§11).
  const offlineAfterCompletion = await db.execute(sql`
    SELECT a.id, a.asset_number AS "assetNumber", a.name
    FROM assets a
    WHERE a.status IN ('offline', 'unplanned_downtime')
      AND a.archived_at IS NULL
      AND EXISTS (
        SELECT 1 FROM work_order_assets woa
        JOIN work_orders wo ON wo.id = woa.work_order_id
        WHERE woa.asset_id = a.id
      )
      AND NOT EXISTS (
        SELECT 1 FROM work_order_assets woa
        JOIN work_orders wo ON wo.id = woa.work_order_id
        WHERE woa.asset_id = a.id
          AND wo.status NOT IN ('completed', 'canceled')
      )
    LIMIT 20
  `);

  // Two+ open downtime-planned WOs on the same critical asset (§11).
  const downtimeConflicts = await db.execute(sql`
    SELECT a.id, a.asset_number AS "assetNumber", a.name, count(*)::int AS "openDowntimeWos"
    FROM assets a
    JOIN work_order_assets woa ON woa.asset_id = a.id
    JOIN work_orders wo ON wo.id = woa.work_order_id
    WHERE a.criticality = 'critical'
      AND wo.status IN ('draft','open','assigned','in_progress','on_hold','waiting')
      AND coalesce(wo.planned_downtime_minutes, 0) > 0
    GROUP BY a.id, a.asset_number, a.name
    HAVING count(*) >= 2
    LIMIT 20
  `);

  return {
    scheduledPastDue,
    archivedAssetWork,
    inactiveAssignee,
    overduePm,
    offlineAfterCompletion: offlineAfterCompletion.rows as {
      id: number;
      assetNumber: string;
      name: string;
    }[],
    downtimeConflicts: downtimeConflicts.rows as {
      id: number;
      assetNumber: string;
      name: string;
      openDowntimeWos: number;
    }[],
  };
}
