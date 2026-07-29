import { and, asc, desc, eq, ilike, inArray, isNull, or, sql } from "drizzle-orm";
import { db } from "@/server/db";
import {
  assets,
  comments,
  locations,
  sites,
  teamMembers,
  teams,
  users,
  workOrderAssets,
  workOrderAssignments,
  workOrderLabor,
  workOrderTimers,
  workOrderParts,
  workOrders,
  workOrderStatusHistory,
} from "@/server/db/schema";
import type { SessionUser } from "@/server/auth/session";
import { recordAudit } from "./audit";
import { ServiceError } from "./users";

export type WorkOrderRow = typeof workOrders.$inferSelect;
export type WoStatusValue = WorkOrderRow["status"];
export type WoPriorityValue = WorkOrderRow["priority"];
export type WoTypeValue = WorkOrderRow["workType"];

export const WO_STATUSES: {
  value: WoStatusValue;
  label: string;
  tone: "gray" | "blue" | "amber" | "green" | "red" | "purple";
}[] = [
  { value: "draft", label: "Draft", tone: "gray" },
  { value: "open", label: "Open", tone: "blue" },
  { value: "assigned", label: "Assigned", tone: "purple" },
  { value: "in_progress", label: "In progress", tone: "amber" },
  { value: "paused", label: "Paused", tone: "amber" },
  { value: "on_hold", label: "On hold", tone: "gray" },
  { value: "waiting", label: "Waiting for parts", tone: "gray" },
  { value: "waiting_approval", label: "Waiting for approval", tone: "purple" },
  { value: "completed", label: "Completed", tone: "green" },
  { value: "canceled", label: "Canceled", tone: "red" },
];

/** Statuses a technician must give a reason for (§8). */
export const REASON_REQUIRED_STATUSES: WoStatusValue[] = [
  "paused",
  "on_hold",
  "waiting",
];

export const WO_PRIORITIES: { value: WoPriorityValue; label: string }[] = [
  { value: "none", label: "None" },
  { value: "low", label: "Low" },
  { value: "medium", label: "Medium" },
  { value: "high", label: "High" },
  { value: "critical", label: "Critical" },
];

export const WO_TYPES: { value: WoTypeValue; label: string }[] = [
  { value: "preventive", label: "Preventive" },
  { value: "reactive", label: "Reactive" },
  { value: "inspection", label: "Inspection" },
  { value: "corrective", label: "Corrective" },
  { value: "safety", label: "Safety" },
  { value: "project", label: "Project" },
  { value: "other", label: "Other" },
];

export function woStatusLabel(v: WoStatusValue): string {
  return WO_STATUSES.find((s) => s.value === v)?.label ?? v;
}

async function nextWoNumber(tx: Pick<typeof db, "select">): Promise<string> {
  const rows = await tx
    .select({ n: sql<string>`max(substring(${workOrders.woNumber} from '^WO-(\\d+)$'))` })
    .from(workOrders);
  const max = rows[0]?.n ? parseInt(rows[0].n, 10) : 0;
  return `WO-${String(max + 1).padStart(4, "0")}`;
}

export async function getWorkOrder(id: number): Promise<WorkOrderRow | null> {
  const rows = await db
    .select()
    .from(workOrders)
    .where(eq(workOrders.id, id))
    .limit(1);
  return rows[0] ?? null;
}

/**
 * Action permission (§4): admins/managers act on any WO. Technicians act on
 * work assigned to them, to a team they belong to, or unassigned work —
 * but never on work assigned exclusively to someone else (Scenario F).
 */
export async function canActOnWorkOrder(
  user: SessionUser,
  workOrderId: number,
): Promise<boolean> {
  if (user.role === "admin" || user.role === "manager") return true;
  if (user.role === "requester") return false;
  const wo = await getWorkOrder(workOrderId);
  if (!wo) return false;
  const assignees = await db
    .select({ userId: workOrderAssignments.userId })
    .from(workOrderAssignments)
    .where(eq(workOrderAssignments.workOrderId, workOrderId));
  if (assignees.some((a) => a.userId === user.id)) return true;
  if (wo.assignedTeamId) {
    const membership = await db
      .select()
      .from(teamMembers)
      .where(
        and(
          eq(teamMembers.teamId, wo.assignedTeamId),
          eq(teamMembers.userId, user.id),
        ),
      )
      .limit(1);
    if (membership.length > 0) return true;
  }
  return assignees.length === 0 && wo.assignedTeamId == null;
}

export type WorkOrderInput = {
  title: string;
  description?: string | null;
  siteId: number;
  locationId?: number | null;
  parentWorkOrderId?: number | null;
  workType: WoTypeValue;
  priority: WoPriorityValue;
  status?: WoStatusValue;
  tags?: string[];
  assetIds?: number[]; // first entry is primary
  assigneeIds?: number[];
  assignedTeamId?: number | null;
  requesterId?: number | null;
  plannedStartAt?: Date | null;
  dueAt?: Date | null;
  estimatedMinutes?: number | null;
  plannedDowntimeMinutes?: number | null;
  laborCost?: string | null;
  otherCost?: string | null;
  source?: WorkOrderRow["source"];
  externalId?: string | null;
};

async function validatePlacement(siteId: number, locationId: number | null) {
  const site = await db
    .select()
    .from(sites)
    .where(eq(sites.id, siteId))
    .limit(1);
  if (site.length === 0) throw new ServiceError("Site not found.");
  if (locationId != null) {
    const loc = await db
      .select()
      .from(locations)
      .where(eq(locations.id, locationId))
      .limit(1);
    if (loc.length === 0) throw new ServiceError("Location not found.");
    if (loc[0].siteId !== siteId) {
      throw new ServiceError("That location belongs to a different site.");
    }
  }
}

async function validateAssets(assetIds: number[], siteId: number) {
  if (assetIds.length === 0) return;
  const rows = await db
    .select()
    .from(assets)
    .where(inArray(assets.id, assetIds));
  if (rows.length !== assetIds.length) {
    throw new ServiceError("One of the selected assets no longer exists.");
  }
  for (const a of rows) {
    if (a.archivedAt) {
      throw new ServiceError(
        `Asset ${a.assetNumber} is archived — it cannot be put on new work orders.`,
      );
    }
    if (a.siteId !== siteId) {
      throw new ServiceError(
        `Asset ${a.assetNumber} is at a different site than this work order.`,
      );
    }
  }
}

export async function createWorkOrder(
  actorId: number,
  input: WorkOrderInput,
): Promise<number> {
  await validatePlacement(input.siteId, input.locationId ?? null);
  const assetIds = [...new Set(input.assetIds ?? [])];
  await validateAssets(assetIds, input.siteId);
  if (input.parentWorkOrderId != null) {
    const parent = await getWorkOrder(input.parentWorkOrderId);
    if (!parent) throw new ServiceError("Parent work order not found.");
  }
  const assigneeIds = [...new Set(input.assigneeIds ?? [])];
  const initialStatus: WoStatusValue =
    input.status ?? (assigneeIds.length > 0 || input.assignedTeamId ? "assigned" : "open");

  return db.transaction(async (tx) => {
    const woNumber = await nextWoNumber(tx);
    const [row] = await tx
      .insert(workOrders)
      .values({
        woNumber,
        title: input.title,
        description: input.description || null,
        siteId: input.siteId,
        locationId: input.locationId ?? null,
        parentWorkOrderId: input.parentWorkOrderId ?? null,
        workType: input.workType,
        priority: input.priority,
        status: initialStatus,
        tags: input.tags && input.tags.length > 0 ? input.tags : null,
        assignedTeamId: input.assignedTeamId ?? null,
        requesterId: input.requesterId ?? null,
        plannedStartAt: input.plannedStartAt ?? null,
        dueAt: input.dueAt ?? null,
        estimatedMinutes: input.estimatedMinutes ?? null,
        plannedDowntimeMinutes: input.plannedDowntimeMinutes ?? null,
        laborCost: input.laborCost ?? null,
        otherCost: input.otherCost ?? null,
        source: input.source ?? "manual",
        externalId: input.externalId ?? null,
        createdBy: actorId,
      })
      .returning({ id: workOrders.id });

    if (assetIds.length > 0) {
      await tx.insert(workOrderAssets).values(
        assetIds.map((assetId, i) => ({
          workOrderId: row.id,
          assetId,
          isPrimary: i === 0,
        })),
      );
    }
    if (assigneeIds.length > 0) {
      await tx.insert(workOrderAssignments).values(
        assigneeIds.map((userId) => ({
          workOrderId: row.id,
          userId,
          assignedBy: actorId,
        })),
      );
      const { notifyUsers } = await import("./notifications");
      await notifyUsers(
        assigneeIds.filter((id) => id !== actorId),
        {
          type: "work_order.assigned",
          title: `Assigned to you: ${input.title}`,
          link: `/work-orders/${row.id}`,
        },
      );
    }
    await tx.insert(workOrderStatusHistory).values({
      workOrderId: row.id,
      status: initialStatus,
      previousStatus: null,
      changedBy: actorId,
      note: "Created",
    });
    await recordAudit(tx, {
      userId: actorId,
      action: "work_order.create",
      entityType: "work_order",
      entityId: row.id,
      summary: `Created ${woNumber} "${input.title}"`,
      source: input.source === "import" ? "import" : "web",
    });
    return row.id;
  });
}

export async function updateWorkOrder(
  actorId: number,
  workOrderId: number,
  input: Omit<WorkOrderInput, "status" | "source" | "externalId">,
): Promise<void> {
  const existing = await getWorkOrder(workOrderId);
  if (!existing) throw new ServiceError("Work order not found.");
  await validatePlacement(input.siteId, input.locationId ?? null);
  const assetIds = [...new Set(input.assetIds ?? [])];
  await validateAssets(assetIds, input.siteId);
  if (input.parentWorkOrderId === workOrderId) {
    throw new ServiceError("A work order cannot be its own parent.");
  }
  const assigneeIds = [...new Set(input.assigneeIds ?? [])];

  await db.transaction(async (tx) => {
    await tx
      .update(workOrders)
      .set({
        title: input.title,
        description: input.description || null,
        siteId: input.siteId,
        locationId: input.locationId ?? null,
        parentWorkOrderId: input.parentWorkOrderId ?? null,
        workType: input.workType,
        priority: input.priority,
        tags: input.tags && input.tags.length > 0 ? input.tags : null,
        assignedTeamId: input.assignedTeamId ?? null,
        requesterId: input.requesterId ?? null,
        plannedStartAt: input.plannedStartAt ?? null,
        dueAt: input.dueAt ?? null,
        estimatedMinutes: input.estimatedMinutes ?? null,
        plannedDowntimeMinutes: input.plannedDowntimeMinutes ?? null,
        laborCost: input.laborCost ?? null,
        otherCost: input.otherCost ?? null,
        updatedAt: new Date(),
      })
      .where(eq(workOrders.id, workOrderId));

    await tx
      .delete(workOrderAssets)
      .where(eq(workOrderAssets.workOrderId, workOrderId));
    if (assetIds.length > 0) {
      await tx.insert(workOrderAssets).values(
        assetIds.map((assetId, i) => ({
          workOrderId,
          assetId,
          isPrimary: i === 0,
        })),
      );
    }

    const currentAssignees = await tx
      .select({ userId: workOrderAssignments.userId })
      .from(workOrderAssignments)
      .where(eq(workOrderAssignments.workOrderId, workOrderId));
    const currentIds = new Set(currentAssignees.map((a) => a.userId));
    const nextIds = new Set(assigneeIds);
    const removed = [...currentIds].filter((id) => !nextIds.has(id));
    const added = [...nextIds].filter((id) => !currentIds.has(id));
    if (removed.length > 0) {
      await tx
        .delete(workOrderAssignments)
        .where(
          and(
            eq(workOrderAssignments.workOrderId, workOrderId),
            inArray(workOrderAssignments.userId, removed),
          ),
        );
    }
    if (added.length > 0) {
      await tx.insert(workOrderAssignments).values(
        added.map((userId) => ({
          workOrderId,
          userId,
          assignedBy: actorId,
        })),
      );
      const { notifyUsers } = await import("./notifications");
      await notifyUsers(
        added.filter((id) => id !== actorId),
        {
          type: "work_order.assigned",
          title: `Assigned to you: ${input.title}`,
          link: `/work-orders/${workOrderId}`,
        },
      );
    }
    if (added.length > 0 || removed.length > 0) {
      await recordAudit(tx, {
        userId: actorId,
        action: "work_order.assignment_change",
        entityType: "work_order",
        entityId: workOrderId,
        summary: `Assignees changed (+${added.length} / -${removed.length})`,
      });
    }

    await recordAudit(tx, {
      userId: actorId,
      action: "work_order.update",
      entityType: "work_order",
      entityId: workOrderId,
      summary: `Updated ${existing.woNumber}`,
    });
  });
}

/**
 * Status transitions (§7): entering in_progress stamps actualStartAt (first
 * time); entering completed stamps completedAt; leaving completed clears it
 * (a reopened WO is not "done"). Full history row on every change.
 */
export async function changeWorkOrderStatus(
  actor: SessionUser,
  workOrderId: number,
  status: WoStatusValue,
  opts?: { note?: string | null; completionNotes?: string | null; actualDowntimeMinutes?: number | null },
): Promise<void> {
  const existing = await getWorkOrder(workOrderId);
  if (!existing) throw new ServiceError("Work order not found.");
  if (!(await canActOnWorkOrder(actor, workOrderId))) {
    throw new ServiceError(
      "This work order is assigned to someone else — ask a manager to reassign it.",
    );
  }
  if (status === "canceled" && actor.role === "technician") {
    throw new ServiceError("Only managers can cancel work orders.");
  }
  if (existing.status === status) return;

  const isManager = actor.role === "admin" || actor.role === "manager";
  // Only a manager clears the approval gate — otherwise a technician could
  // simply re-complete their way past it.
  if (existing.status === "waiting_approval" && !isManager) {
    throw new ServiceError(
      "This work order is waiting for a manager to approve it.",
    );
  }
  // Pausing/holding/waiting must say why — a bare status change tells the
  // next person nothing (§8).
  if (
    REASON_REQUIRED_STATUSES.includes(status) &&
    !(opts?.note && opts.note.trim())
  ) {
    throw new ServiceError(
      `Say why the work is going to "${woStatusLabel(status)}" — a short reason is required.`,
    );
  }

  // Completion gate (§7): required procedure steps must be answered first.
  // Applies to the approval hand-off too, so incomplete work never reaches
  // a manager's queue.
  let effectiveStatus = status;
  if (status === "completed") {
    const { getCompletionBlockers } = await import("./procedures");
    const blockers = await getCompletionBlockers(workOrderId);
    if (blockers.length > 0) {
      throw new ServiceError(
        `Cannot complete yet — required procedure steps are missing: ${blockers.join("; ")}`,
      );
    }
    // Optional approval step: a technician's completion parks for review.
    const { readOrgSettings } = await import("./org");
    const org = await readOrgSettings();
    if (org.requireCompletionApproval && !isManager) {
      effectiveStatus = "waiting_approval";
    }
  }
  status = effectiveStatus;
  if (existing.status === status) return;

  const now = new Date();
  await db.transaction(async (tx) => {
    const patch: Partial<typeof workOrders.$inferInsert> = {
      status,
      updatedAt: now,
    };
    if (status === "in_progress" && !existing.actualStartAt) {
      patch.actualStartAt = now;
    }
    // The technician's write-up is captured whether the job completes
    // outright or parks for approval — the manager reviews what was written.
    if (status === "completed" || status === "waiting_approval") {
      if (opts?.completionNotes) patch.completionNotes = opts.completionNotes;
      if (opts?.actualDowntimeMinutes != null) {
        patch.actualDowntimeMinutes = opts.actualDowntimeMinutes;
      }
    }
    if (status === "completed") {
      patch.completedAt = now;
    } else if (existing.status === "completed") {
      patch.completedAt = null;
    }
    await tx.update(workOrders).set(patch).where(eq(workOrders.id, workOrderId));
    await tx.insert(workOrderStatusHistory).values({
      workOrderId,
      status,
      previousStatus: existing.status,
      note: opts?.note ?? null,
      changedBy: actor.id,
    });
    await recordAudit(tx, {
      userId: actor.id,
      action: "work_order.status_change",
      entityType: "work_order",
      entityId: workOrderId,
      summary: `${existing.woNumber}: ${woStatusLabel(existing.status)} → ${woStatusLabel(status)}`,
      previousValue: { status: existing.status },
      newValue: { status },
    });
  });

  // Tell the requester when the work their request spawned is finished (§8).
  if (status === "completed") {
    const { notifyRequestClosedForWo } = await import("./requests");
    await notifyRequestClosedForWo(workOrderId);
    // Floating PM plans re-anchor from completion (§9).
    const { onPmWorkOrderCompleted } = await import("./pm");
    await onPmWorkOrderCompleted(workOrderId);
  }

  // Downtime automation (§11/Scenario E): starting a WO that plans downtime
  // takes its primary asset into planned_downtime; finishing brings an asset
  // this workflow took down back online. Manual status changes still win —
  // we only flip states this workflow itself set.
  if (
    (status === "in_progress" || status === "completed" || status === "canceled") &&
    (existing.plannedDowntimeMinutes ?? 0) > 0
  ) {
    const { changeAssetStatus, getAsset } = await import("./assets");
    const [primary] = await db
      .select({ assetId: workOrderAssets.assetId })
      .from(workOrderAssets)
      .where(
        and(
          eq(workOrderAssets.workOrderId, workOrderId),
          eq(workOrderAssets.isPrimary, true),
        ),
      )
      .limit(1);
    if (primary) {
      const asset = await getAsset(primary.assetId);
      if (status === "in_progress" && asset?.status === "online") {
        await changeAssetStatus(
          actor.id,
          primary.assetId,
          "planned_downtime",
          `${existing.woNumber} started (planned downtime)`,
        );
      } else if (
        (status === "completed" || status === "canceled") &&
        asset?.status === "planned_downtime"
      ) {
        await changeAssetStatus(
          actor.id,
          primary.assetId,
          "online",
          `${existing.woNumber} ${status === "completed" ? "completed" : "canceled"}`,
        );
      }
    }
  }
}

export async function addComment(
  actor: SessionUser,
  entityType: "work_order" | "request",
  entityId: number,
  body: string,
  isInternal = false,
): Promise<void> {
  if (entityType === "work_order") {
    const wo = await getWorkOrder(entityId);
    if (!wo) throw new ServiceError("Work order not found.");
  }
  await db.transaction(async (tx) => {
    await tx.insert(comments).values({
      entityType,
      entityId,
      userId: actor.id,
      body,
      isInternal,
    });
    await recordAudit(tx, {
      userId: actor.id,
      action: "comment.create",
      entityType,
      entityId,
      summary: isInternal ? "Added internal note" : "Added comment",
    });
  });

  // Comment notifications (§8): on a request, tell the other side —
  // never for internal notes.
  if (entityType === "request" && !isInternal) {
    const { getRequest } = await import("./requests");
    const { managerAudience, notifyUsers } = await import("./notifications");
    const req = await getRequest(entityId);
    if (req) {
      const audience =
        req.requesterId === actor.id
          ? await managerAudience()
          : req.requesterId
            ? [req.requesterId]
            : [];
      await notifyUsers(
        audience.filter((id) => id !== actor.id),
        {
          type: "request.comment",
          title: `New comment on "${req.title}"`,
          link: `/requests/${entityId}`,
        },
      );
    }
  }
}

export async function addLabor(
  actor: SessionUser,
  workOrderId: number,
  input: { minutes: number; note?: string | null; workDate?: string | null },
): Promise<void> {
  const wo = await getWorkOrder(workOrderId);
  if (!wo) throw new ServiceError("Work order not found.");
  if (!(await canActOnWorkOrder(actor, workOrderId))) {
    throw new ServiceError("This work order is assigned to someone else.");
  }
  if (input.minutes <= 0 || input.minutes > 24 * 60) {
    throw new ServiceError("Labor time must be between 1 minute and 24 hours.");
  }
  await db.transaction(async (tx) => {
    await tx.insert(workOrderLabor).values({
      workOrderId,
      userId: actor.id,
      minutes: input.minutes,
      note: input.note || null,
      workDate: input.workDate || null,
    });
    await recordAudit(tx, {
      userId: actor.id,
      action: "work_order.labor",
      entityType: "work_order",
      entityId: workOrderId,
      summary: `Logged ${input.minutes} min of labor`,
    });
  });
}

/**
 * Labor timers (§14). Start/pause/resume/stop from the phone rather than
 * doing arithmetic at the end of the day. Stopping converts the elapsed
 * time into an ordinary work_order_labor row, so every existing report
 * keeps working unchanged.
 */
export type ActiveTimer = {
  id: number;
  workOrderId: number;
  startedAt: Date;
  accumulatedMinutes: number;
};

export async function getActiveTimer(userId: number): Promise<ActiveTimer | null> {
  const [row] = await db
    .select()
    .from(workOrderTimers)
    .where(
      and(eq(workOrderTimers.userId, userId), isNull(workOrderTimers.stoppedAt)),
    )
    .limit(1);
  return row
    ? {
        id: row.id,
        workOrderId: row.workOrderId,
        startedAt: row.startedAt,
        accumulatedMinutes: row.accumulatedMinutes,
      }
    : null;
}

/** Minutes elapsed on a running timer, banked time included. */
export function timerMinutes(timer: ActiveTimer, now: Date = new Date()): number {
  const live = Math.floor((now.getTime() - timer.startedAt.getTime()) / 60000);
  return timer.accumulatedMinutes + Math.max(0, live);
}

/**
 * Minutes banked on this job by a paused timer — what a "Resume" would
 * pick back up from. Zero once the time has been logged.
 */
export async function bankedTimerMinutes(
  userId: number,
  workOrderId: number,
): Promise<number> {
  const [row] = await db
    .select({ minutes: workOrderTimers.accumulatedMinutes })
    .from(workOrderTimers)
    .where(
      and(
        eq(workOrderTimers.workOrderId, workOrderId),
        eq(workOrderTimers.userId, userId),
        eq(workOrderTimers.carriedForward, true),
      ),
    )
    .orderBy(desc(workOrderTimers.id))
    .limit(1);
  return row?.minutes ?? 0;
}

export async function startTimer(
  actor: SessionUser,
  workOrderId: number,
): Promise<void> {
  const wo = await getWorkOrder(workOrderId);
  if (!wo) throw new ServiceError("Work order not found.");
  if (wo.status === "completed" || wo.status === "canceled") {
    throw new ServiceError("This work order is finished.");
  }
  if (!(await canActOnWorkOrder(actor, workOrderId))) {
    throw new ServiceError("This work order is assigned to someone else.");
  }
  const active = await getActiveTimer(actor.id);
  if (active) {
    if (active.workOrderId === workOrderId) return; // already running here
    throw new ServiceError(
      "You already have a timer running on another work order — stop it first.",
    );
  }
  // Resume banked time from an earlier pause on this same job.
  const [prior] = await db
    .select({ minutes: workOrderTimers.accumulatedMinutes })
    .from(workOrderTimers)
    .where(
      and(
        eq(workOrderTimers.workOrderId, workOrderId),
        eq(workOrderTimers.userId, actor.id),
        eq(workOrderTimers.carriedForward, true),
      ),
    )
    .orderBy(desc(workOrderTimers.id))
    .limit(1);
  await db.insert(workOrderTimers).values({
    workOrderId,
    userId: actor.id,
    accumulatedMinutes: prior?.minutes ?? 0,
  });
}

/**
 * Pause: bank the elapsed minutes and stop the clock, keeping the total so
 * a later start on the same job resumes from it. No labor row yet — the
 * job isn't done being worked.
 */
export async function pauseTimer(actor: SessionUser): Promise<void> {
  const active = await getActiveTimer(actor.id);
  if (!active) throw new ServiceError("No timer is running.");
  await db
    .update(workOrderTimers)
    .set({
      stoppedAt: new Date(),
      accumulatedMinutes: timerMinutes(active),
      carriedForward: true,
    })
    .where(eq(workOrderTimers.id, active.id));
}

/**
 * Stop: convert the elapsed time into a labor entry and clear the banked
 * total so the next start begins at zero. Under a minute is discarded
 * rather than rounded up to a false minute.
 */
export async function stopTimer(
  actor: SessionUser,
  note?: string | null,
): Promise<number> {
  const active = await getActiveTimer(actor.id);
  if (!active) throw new ServiceError("No timer is running.");
  const minutes = timerMinutes(active);
  await db.transaction(async (tx) => {
    await tx
      .update(workOrderTimers)
      .set({
        stoppedAt: new Date(),
        accumulatedMinutes: minutes,
        carriedForward: false,
      })
      .where(eq(workOrderTimers.id, active.id));
    // Clear any banked total from earlier pauses on this job.
    await tx
      .update(workOrderTimers)
      .set({ carriedForward: false })
      .where(
        and(
          eq(workOrderTimers.workOrderId, active.workOrderId),
          eq(workOrderTimers.userId, actor.id),
        ),
      );
    if (minutes > 0) {
      await tx.insert(workOrderLabor).values({
        workOrderId: active.workOrderId,
        userId: actor.id,
        minutes,
        note: note?.trim() || "Timed on the job",
      });
      await recordAudit(tx, {
        userId: actor.id,
        action: "work_order.labor",
        entityType: "work_order",
        entityId: active.workOrderId,
        summary: `Timer stopped: logged ${minutes} min of labor`,
      });
    }
  });
  return minutes;
}

/**
 * Document a part or material used on the work — free-form name + cost, no
 * catalog required (parts *inventory* stays deferred, DECISIONS.md #4).
 * Same access rule as labor: assignees, their team, or a manager.
 */
export async function addPart(
  actor: SessionUser,
  workOrderId: number,
  input: { name: string; quantity: number; unitCost?: number | null; note?: string | null },
): Promise<void> {
  const wo = await getWorkOrder(workOrderId);
  if (!wo) throw new ServiceError("Work order not found.");
  if (!(await canActOnWorkOrder(actor, workOrderId))) {
    throw new ServiceError("This work order is assigned to someone else.");
  }
  const name = input.name.trim();
  if (!name) throw new ServiceError("Part name is required.");
  if (!(input.quantity > 0) || input.quantity > 100000) {
    throw new ServiceError("Quantity must be a positive number.");
  }
  if (input.unitCost != null && (input.unitCost < 0 || input.unitCost > 1e9)) {
    throw new ServiceError("Unit cost must be zero or more.");
  }
  await db.transaction(async (tx) => {
    await tx.insert(workOrderParts).values({
      workOrderId,
      name,
      quantity: input.quantity.toString(),
      unitCost: input.unitCost != null ? input.unitCost.toFixed(2) : null,
      note: input.note || null,
      addedBy: actor.id,
    });
    await recordAudit(tx, {
      userId: actor.id,
      action: "work_order.part",
      entityType: "work_order",
      entityId: workOrderId,
      summary: `Used ${input.quantity} × ${name}${input.unitCost != null ? ` @ ${input.unitCost.toFixed(2)}` : ""}`,
    });
  });
}

/** Remove a mistaken part line — only whoever added it, or a manager. */
export async function removePart(actor: SessionUser, partId: number): Promise<void> {
  const [row] = await db
    .select()
    .from(workOrderParts)
    .where(eq(workOrderParts.id, partId))
    .limit(1);
  if (!row) throw new ServiceError("Part entry not found.");
  const isManager = actor.role === "admin" || actor.role === "manager";
  if (!isManager && row.addedBy !== actor.id) {
    throw new ServiceError("Only the person who added a part (or a manager) can remove it.");
  }
  if (!(await canActOnWorkOrder(actor, row.workOrderId))) {
    throw new ServiceError("This work order is assigned to someone else.");
  }
  await db.transaction(async (tx) => {
    await tx.delete(workOrderParts).where(eq(workOrderParts.id, partId));
    await recordAudit(tx, {
      userId: actor.id,
      action: "work_order.part_removed",
      entityType: "work_order",
      entityId: row.workOrderId,
      summary: `Removed part line "${row.name}"`,
    });
  });
}

export type WorkOrderListFilters = {
  q?: string;
  status?: WoStatusValue | "open_group";
  priority?: WoPriorityValue;
  workType?: WoTypeValue;
  siteId?: number;
  assigneeId?: number;
  assetId?: number;
  includeDone?: boolean;
};

const OPEN_STATUSES: WoStatusValue[] = [
  "open",
  "assigned",
  "in_progress",
  "paused",
  "on_hold",
  "waiting",
  "waiting_approval",
  "draft",
];

export async function listWorkOrders(filters: WorkOrderListFilters = {}) {
  const conds = [];
  if (filters.q) {
    const like = `%${filters.q}%`;
    conds.push(or(ilike(workOrders.title, like), ilike(workOrders.woNumber, like)));
  }
  if (filters.status === "open_group") {
    conds.push(inArray(workOrders.status, OPEN_STATUSES));
  } else if (filters.status) {
    conds.push(eq(workOrders.status, filters.status));
  } else if (!filters.includeDone) {
    // Default view: everything not finished.
    conds.push(inArray(workOrders.status, OPEN_STATUSES));
  }
  if (filters.priority) conds.push(eq(workOrders.priority, filters.priority));
  if (filters.workType) conds.push(eq(workOrders.workType, filters.workType));
  if (filters.siteId) conds.push(eq(workOrders.siteId, filters.siteId));
  if (filters.assigneeId) {
    conds.push(
      sql`${workOrders.id} IN (SELECT work_order_id FROM work_order_assignments WHERE user_id = ${filters.assigneeId})`,
    );
  }
  if (filters.assetId) {
    conds.push(
      sql`${workOrders.id} IN (SELECT work_order_id FROM work_order_assets WHERE asset_id = ${filters.assetId})`,
    );
  }

  const rows = await db
    .select({
      wo: workOrders,
      siteName: sites.name,
      locationName: locations.name,
      teamName: teams.name,
    })
    .from(workOrders)
    .innerJoin(sites, eq(workOrders.siteId, sites.id))
    .leftJoin(locations, eq(workOrders.locationId, locations.id))
    .leftJoin(teams, eq(workOrders.assignedTeamId, teams.id))
    .where(conds.length > 0 ? and(...conds) : undefined)
    .orderBy(desc(workOrders.createdAt))
    .limit(500);

  const ids = rows.map((r) => r.wo.id);
  const assignees =
    ids.length > 0
      ? await db
          .select({
            workOrderId: workOrderAssignments.workOrderId,
            displayName: users.displayName,
          })
          .from(workOrderAssignments)
          .innerJoin(users, eq(workOrderAssignments.userId, users.id))
          .where(inArray(workOrderAssignments.workOrderId, ids))
      : [];
  return rows.map((r) => ({
    ...r,
    assignees: assignees
      .filter((a) => a.workOrderId === r.wo.id)
      .map((a) => a.displayName),
  }));
}

/** Everything the WO detail page needs. */
export async function getWorkOrderDetail(workOrderId: number) {
  const wo = await getWorkOrder(workOrderId);
  if (!wo) return null;
  const [site] = await db
    .select()
    .from(sites)
    .where(eq(sites.id, wo.siteId))
    .limit(1);
  const location = wo.locationId
    ? (
        await db
          .select()
          .from(locations)
          .where(eq(locations.id, wo.locationId))
          .limit(1)
      )[0]
    : null;
  const team = wo.assignedTeamId
    ? (
        await db
          .select()
          .from(teams)
          .where(eq(teams.id, wo.assignedTeamId))
          .limit(1)
      )[0]
    : null;
  const woAssets = await db
    .select({ link: workOrderAssets, asset: assets })
    .from(workOrderAssets)
    .innerJoin(assets, eq(workOrderAssets.assetId, assets.id))
    .where(eq(workOrderAssets.workOrderId, workOrderId));
  const assignments = await db
    .select({
      userId: workOrderAssignments.userId,
      displayName: users.displayName,
    })
    .from(workOrderAssignments)
    .innerJoin(users, eq(workOrderAssignments.userId, users.id))
    .where(eq(workOrderAssignments.workOrderId, workOrderId));
  const history = await db
    .select({
      entry: workOrderStatusHistory,
      changedByName: users.displayName,
    })
    .from(workOrderStatusHistory)
    .innerJoin(users, eq(workOrderStatusHistory.changedBy, users.id))
    .where(eq(workOrderStatusHistory.workOrderId, workOrderId))
    .orderBy(desc(workOrderStatusHistory.createdAt));
  const commentRows = await db
    .select({ comment: comments, authorName: users.displayName })
    .from(comments)
    .innerJoin(users, eq(comments.userId, users.id))
    .where(
      and(eq(comments.entityType, "work_order"), eq(comments.entityId, workOrderId)),
    )
    .orderBy(asc(comments.createdAt));
  const labor = await db
    .select({ entry: workOrderLabor, userName: users.displayName })
    .from(workOrderLabor)
    .innerJoin(users, eq(workOrderLabor.userId, users.id))
    .where(eq(workOrderLabor.workOrderId, workOrderId))
    .orderBy(asc(workOrderLabor.createdAt));
  const laborTotal = labor.reduce((sum, l) => sum + l.entry.minutes, 0);
  const parts = await db
    .select({ entry: workOrderParts, userName: users.displayName })
    .from(workOrderParts)
    .innerJoin(users, eq(workOrderParts.addedBy, users.id))
    .where(eq(workOrderParts.workOrderId, workOrderId))
    .orderBy(asc(workOrderParts.createdAt));
  // Total only over costed lines; uncosted parts still appear in the list.
  const partsCostTotal = parts.reduce((sum, p) => {
    const qty = Number(p.entry.quantity);
    const cost = p.entry.unitCost != null ? Number(p.entry.unitCost) : null;
    return cost != null ? sum + qty * cost : sum;
  }, 0);
  const requester = wo.requesterId
    ? (
        await db
          .select({ displayName: users.displayName })
          .from(users)
          .where(eq(users.id, wo.requesterId))
          .limit(1)
      )[0]
    : null;
  const parent = wo.parentWorkOrderId
    ? await getWorkOrder(wo.parentWorkOrderId)
    : null;
  const children = await db
    .select()
    .from(workOrders)
    .where(eq(workOrders.parentWorkOrderId, workOrderId))
    .orderBy(asc(workOrders.id));
  const creator = (
    await db
      .select({ displayName: users.displayName })
      .from(users)
      .where(eq(users.id, wo.createdBy))
      .limit(1)
  )[0];

  return {
    wo,
    site: site ?? null,
    location,
    team,
    assets: woAssets,
    assignments,
    history,
    comments: commentRows,
    labor,
    laborTotal,
    parts,
    partsCostTotal,
    requester,
    parent,
    children,
    creator,
  };
}
