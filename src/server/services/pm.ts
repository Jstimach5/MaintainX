import { and, asc, desc, eq, isNull, lte, sql } from "drizzle-orm";
import { db } from "@/server/db";
import {
  assets,
  pmOccurrences,
  pmPlans,
  sites,
  workOrders,
} from "@/server/db/schema";
import { addRecurrence, projectOccurrences } from "@/lib/recurrence";
import { addDays, todayInTimezone, wallTimeToUtc } from "@/lib/format";
import { getOrgSettings } from "./org";
import { recordAudit } from "./audit";
import { ServiceError } from "./users";
import { createWorkOrder } from "./workOrders";
import { attachProcedure, getTemplate } from "./procedures";

export type PmPlanRow = typeof pmPlans.$inferSelect;

export async function getPlan(id: number): Promise<PmPlanRow | null> {
  const rows = await db.select().from(pmPlans).where(eq(pmPlans.id, id)).limit(1);
  return rows[0] ?? null;
}

export async function listPlans() {
  return db
    .select({
      plan: pmPlans,
      siteName: sites.name,
      assetName: assets.name,
      assetNumber: assets.assetNumber,
    })
    .from(pmPlans)
    .innerJoin(sites, eq(pmPlans.siteId, sites.id))
    .leftJoin(assets, eq(pmPlans.assetId, assets.id))
    .orderBy(asc(pmPlans.nextDue));
}

export type PmPlanInput = {
  name: string;
  description?: string | null;
  siteId: number;
  locationId?: number | null;
  assetId?: number | null;
  assignedTeamId?: number | null;
  assigneeIds?: number[];
  procedureTemplateId?: number | null;
  priority: PmPlanRow["priority"];
  estimatedMinutes?: number | null;
  plannedDowntimeMinutes?: number | null;
  basis: "fixed" | "floating";
  recurUnit: "day" | "week" | "month" | "year";
  recurInterval: number;
  leadDays: number;
  startDate: string;
  endDate?: string | null;
  isPaused?: boolean;
};

async function validatePlan(input: PmPlanInput) {
  const site = await db
    .select()
    .from(sites)
    .where(eq(sites.id, input.siteId))
    .limit(1);
  if (site.length === 0 || !site[0].isActive) {
    throw new ServiceError("Site not found.");
  }
  if (input.assetId != null) {
    const asset = await db
      .select()
      .from(assets)
      .where(eq(assets.id, input.assetId))
      .limit(1);
    if (asset.length === 0) throw new ServiceError("Asset not found.");
    if (asset[0].siteId !== input.siteId) {
      throw new ServiceError("Asset is at a different site.");
    }
    if (asset[0].archivedAt) {
      throw new ServiceError("That asset is archived.");
    }
  }
  if (input.procedureTemplateId != null) {
    const tpl = await getTemplate(input.procedureTemplateId);
    if (!tpl || !tpl.isActive) throw new ServiceError("Procedure not found.");
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.startDate)) {
    throw new ServiceError("Start date is required.");
  }
  if (input.endDate && input.endDate < input.startDate) {
    throw new ServiceError("End date must be after the start date.");
  }
}

export async function createPlan(
  actorId: number,
  input: PmPlanInput,
): Promise<number> {
  await validatePlan(input);
  return db.transaction(async (tx) => {
    const [row] = await tx
      .insert(pmPlans)
      .values({
        name: input.name,
        description: input.description || null,
        siteId: input.siteId,
        locationId: input.locationId ?? null,
        assetId: input.assetId ?? null,
        assignedTeamId: input.assignedTeamId ?? null,
        assigneeIds:
          input.assigneeIds && input.assigneeIds.length > 0
            ? input.assigneeIds
            : null,
        procedureTemplateId: input.procedureTemplateId ?? null,
        priority: input.priority,
        estimatedMinutes: input.estimatedMinutes ?? null,
        plannedDowntimeMinutes: input.plannedDowntimeMinutes ?? null,
        basis: input.basis,
        recurUnit: input.recurUnit,
        recurInterval: input.recurInterval,
        leadDays: input.leadDays,
        startDate: input.startDate,
        endDate: input.endDate || null,
        nextDue: input.startDate,
        isPaused: input.isPaused ?? false,
        createdBy: actorId,
      })
      .returning({ id: pmPlans.id });
    await recordAudit(tx, {
      userId: actorId,
      action: "pm_plan.create",
      entityType: "pm_plan",
      entityId: row.id,
      summary: `Created PM plan "${input.name}" (every ${input.recurInterval} ${input.recurUnit}(s), ${input.basis})`,
    });
    return row.id;
  });
}

export async function updatePlan(
  actorId: number,
  planId: number,
  input: PmPlanInput & { nextDue?: string },
): Promise<void> {
  const existing = await getPlan(planId);
  if (!existing) throw new ServiceError("PM plan not found.");
  await validatePlan(input);
  await db.transaction(async (tx) => {
    await tx
      .update(pmPlans)
      .set({
        name: input.name,
        description: input.description || null,
        siteId: input.siteId,
        locationId: input.locationId ?? null,
        assetId: input.assetId ?? null,
        assignedTeamId: input.assignedTeamId ?? null,
        assigneeIds:
          input.assigneeIds && input.assigneeIds.length > 0
            ? input.assigneeIds
            : null,
        procedureTemplateId: input.procedureTemplateId ?? null,
        priority: input.priority,
        estimatedMinutes: input.estimatedMinutes ?? null,
        plannedDowntimeMinutes: input.plannedDowntimeMinutes ?? null,
        basis: input.basis,
        recurUnit: input.recurUnit,
        recurInterval: input.recurInterval,
        leadDays: input.leadDays,
        startDate: input.startDate,
        endDate: input.endDate || null,
        // Changed recurrence rules re-anchor from the provided next due (or
        // keep the current one).
        nextDue: input.nextDue ?? existing.nextDue,
        isPaused: input.isPaused ?? existing.isPaused,
        updatedAt: new Date(),
      })
      .where(eq(pmPlans.id, planId));
    await recordAudit(tx, {
      userId: actorId,
      action: "pm_plan.update",
      entityType: "pm_plan",
      entityId: planId,
      summary: `Updated PM plan "${input.name}"${input.isPaused && !existing.isPaused ? " (paused)" : ""}${!input.isPaused && existing.isPaused ? " (resumed)" : ""}`,
    });
  });
}

/** Upcoming due dates for the plan page preview (§9). */
export function previewPlan(plan: PmPlanRow, count = 6): string[] {
  return projectOccurrences(
    plan.nextDue,
    plan.recurUnit,
    plan.recurInterval,
    count,
    plan.endDate,
  );
}

/**
 * The scheduler tick (§9). Idempotent by construction: each occurrence is
 * claimed via the UNIQUE (plan, occurrence_key) index before its WO is
 * created; re-runs and crash-retries can never double-generate. Missed
 * occurrences after downtime collapse into ONE catch-up WO (keeping the
 * overdue due date) instead of a stack.
 */
export async function runPmTick(): Promise<{ generated: number; repaired: number }> {
  const org = await getOrgSettings();
  const today = todayInTimezone(org.timezone);
  let generated = 0;
  let repaired = 0;

  // Repair pass: occurrences claimed but missing their WO (crash window).
  const orphans = await db
    .select()
    .from(pmOccurrences)
    .where(isNull(pmOccurrences.workOrderId));
  for (const orphan of orphans) {
    const plan = await getPlan(orphan.planId);
    if (!plan) continue;
    const woId = await createWoForPlan(plan, orphan.occurrenceKey, org.timezone);
    await db
      .update(pmOccurrences)
      .set({ workOrderId: woId })
      .where(eq(pmOccurrences.id, orphan.id));
    repaired += 1;
  }

  const duePlans = await db
    .select()
    .from(pmPlans)
    .where(
      and(eq(pmPlans.isPaused, false), lte(pmPlans.nextDue, addDays(today, 30))),
    );

  for (const plan of duePlans) {
    try {
      const generateFrom = addDays(plan.nextDue, -plan.leadDays);
      if (generateFrom > today) continue; // not inside the lead window yet
      if (plan.endDate && plan.nextDue > plan.endDate) continue;

      // Skip plans whose asset is archived (§9), but log it once per tick.
      if (plan.assetId) {
        const [asset] = await db
          .select()
          .from(assets)
          .where(eq(assets.id, plan.assetId))
          .limit(1);
        if (asset?.archivedAt) continue;
      }

      // Floating basis: never stack — wait for the open occurrence's WO.
      if (plan.basis === "floating") {
        const open = await db
          .select({ status: workOrders.status })
          .from(pmOccurrences)
          .innerJoin(workOrders, eq(pmOccurrences.workOrderId, workOrders.id))
          .where(eq(pmOccurrences.planId, plan.id))
          .orderBy(desc(pmOccurrences.createdAt))
          .limit(1);
        if (
          open.length > 0 &&
          open[0].status !== "completed" &&
          open[0].status !== "canceled"
        ) {
          continue;
        }
      }

      // Claim the occurrence (idempotency gate).
      const claimed = await db
        .insert(pmOccurrences)
        .values({ planId: plan.id, occurrenceKey: plan.nextDue })
        .onConflictDoNothing()
        .returning({ id: pmOccurrences.id });
      if (claimed.length === 0) {
        // Already generated (fixed basis marches on regardless).
        if (plan.basis === "fixed") {
          await advanceFixed(plan, today);
        }
        continue;
      }

      const woId = await createWoForPlan(plan, plan.nextDue, org.timezone);
      await db
        .update(pmOccurrences)
        .set({ workOrderId: woId })
        .where(eq(pmOccurrences.id, claimed[0].id));
      generated += 1;

      if (plan.basis === "fixed") {
        await advanceFixed(plan, today);
      }
      // Floating: nextDue advances only on completion (onPmWorkOrderCompleted).
      await db
        .update(pmPlans)
        .set({ lastGeneratedAt: new Date() })
        .where(eq(pmPlans.id, plan.id));
    } catch (err) {
      // One broken plan must not stop the tick.
      console.error(`[pm] plan ${plan.id} generation failed:`, err);
    }
  }
  return { generated, repaired };
}

/** Fixed basis: march nextDue past today, skipping missed occurrences. */
async function advanceFixed(plan: PmPlanRow, today: string): Promise<void> {
  let next = plan.nextDue;
  do {
    next = addRecurrence(next, plan.recurUnit, plan.recurInterval);
  } while (next <= today);
  await db.update(pmPlans).set({ nextDue: next }).where(eq(pmPlans.id, plan.id));
}

async function createWoForPlan(
  plan: PmPlanRow,
  dueDate: string,
  timezone: string,
): Promise<number> {
  const woId = await createWorkOrder(plan.createdBy, {
    title: plan.name,
    description: plan.description,
    siteId: plan.siteId,
    locationId: plan.locationId,
    assetIds: plan.assetId ? [plan.assetId] : [],
    workType: plan.workType,
    priority: plan.priority,
    assigneeIds: plan.assigneeIds ?? [],
    assignedTeamId: plan.assignedTeamId,
    estimatedMinutes: plan.estimatedMinutes,
    plannedDowntimeMinutes: plan.plannedDowntimeMinutes,
    dueAt: wallTimeToUtc(`${dueDate}T17:00`, timezone),
    source: "pm",
  });
  await db
    .update(workOrders)
    .set({ pmPlanId: plan.id })
    .where(eq(workOrders.id, woId));
  if (plan.procedureTemplateId) {
    try {
      await attachProcedure(plan.createdBy, woId, plan.procedureTemplateId);
    } catch (err) {
      console.error(`[pm] procedure attach failed for plan ${plan.id}:`, err);
    }
  }
  await recordAudit(db, {
    userId: null,
    action: "pm_plan.generated",
    entityType: "pm_plan",
    entityId: plan.id,
    summary: `Generated work order #${woId} due ${dueDate}`,
    source: "worker",
    correlationId: `pm-${plan.id}-${dueDate}`,
  });
  return woId;
}

/**
 * Floating-basis hook: when a PM-generated WO completes, the next due date
 * re-anchors from the completion date (§9 early/late completion handling).
 */
export async function onPmWorkOrderCompleted(workOrderId: number): Promise<void> {
  const [wo] = await db
    .select()
    .from(workOrders)
    .where(eq(workOrders.id, workOrderId))
    .limit(1);
  if (!wo?.pmPlanId) return;
  const plan = await getPlan(wo.pmPlanId);
  if (!plan || plan.basis !== "floating") return;
  const org = await getOrgSettings();
  const completedDay = todayInTimezone(org.timezone, wo.completedAt ?? new Date());
  const next = addRecurrence(completedDay, plan.recurUnit, plan.recurInterval);
  await db
    .update(pmPlans)
    .set({ nextDue: next, updatedAt: new Date() })
    .where(eq(pmPlans.id, plan.id));
}

/** Generated-WO history for the plan page. */
export async function planHistory(planId: number) {
  return db
    .select({ occurrence: pmOccurrences, wo: workOrders })
    .from(pmOccurrences)
    .leftJoin(workOrders, eq(pmOccurrences.workOrderId, workOrders.id))
    .where(eq(pmOccurrences.planId, planId))
    .orderBy(desc(pmOccurrences.createdAt))
    .limit(50);
}

/** Warning surface for §11: plans past due (overdue PM). */
export async function overduePmPlans(today: string) {
  return db
    .select()
    .from(pmPlans)
    .where(
      and(eq(pmPlans.isPaused, false), sql`${pmPlans.nextDue} < ${today}`),
    );
}
