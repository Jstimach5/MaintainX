import { beforeEach, describe, expect, it } from "vitest";
import { eq, sql } from "drizzle-orm";
import { db } from "@/server/db";
import { workOrderStatusHistory } from "@/server/db/schema";
import { createSite } from "@/server/services/sites";
import { createAsset, setAssetArchived } from "@/server/services/assets";
import { createTeam, updateTeam } from "@/server/services/teams";
import {
  addComment,
  addLabor,
  addPart,
  bankedTimerMinutes,
  getActiveTimer,
  pauseTimer,
  startTimer,
  stopTimer,
  canActOnWorkOrder,
  changeWorkOrderStatus,
  createWorkOrder,
  getWorkOrder,
  getWorkOrderDetail,
  listWorkOrders,
  removePart,
  updateWorkOrder,
} from "@/server/services/workOrders";
import { ServiceError } from "@/server/services/users";
import { makeUser, truncateAll } from "./helpers";
import type { SessionUser } from "@/server/auth/session";

async function reset() {
  await truncateAll();
  await db.execute(sql`
    TRUNCATE TABLE comments, work_order_parts, work_order_timers, work_order_labor,
      work_order_status_history,
      work_order_assignments, work_order_assets, work_orders,
      asset_location_history, asset_status_history, attachments, assets,
      locations, sites, team_members, teams RESTART IDENTITY CASCADE
  `);
}

function asSession(u: { id: number; username: string; role: SessionUser["role"] }): SessionUser {
  return {
    id: u.id,
    username: u.username,
    displayName: u.username,
    email: null,
    mustChangePassword: false,
    role: u.role,
  };
}

let admin: SessionUser;
let manager: SessionUser;
let tech: SessionUser;
let otherTech: SessionUser;
let siteId: number;
let assetId: number;

beforeEach(async () => {
  await reset();
  admin = asSession(await makeUser({ role: "admin" }));
  manager = asSession(await makeUser({ role: "manager" }));
  tech = asSession(await makeUser({ role: "technician" }));
  otherTech = asSession(await makeUser({ role: "technician" }));
  siteId = await createSite(admin.id, { name: "Main" });
  assetId = await createAsset(admin.id, {
    name: "Pump",
    siteId,
    criticality: "medium",
  });
});

const baseWo = () => ({
  title: "Fix the pump",
  siteId,
  workType: "reactive" as const,
  priority: "medium" as const,
});

describe("creation", () => {
  it("assigns sequential WO numbers", async () => {
    const a = await createWorkOrder(admin.id, baseWo());
    const b = await createWorkOrder(admin.id, baseWo());
    expect((await getWorkOrder(a))?.woNumber).toBe("WO-0001");
    expect((await getWorkOrder(b))?.woNumber).toBe("WO-0002");
  });

  it("starts as 'open' unassigned, 'assigned' when given people", async () => {
    const a = await createWorkOrder(admin.id, baseWo());
    const b = await createWorkOrder(admin.id, {
      ...baseWo(),
      assigneeIds: [tech.id],
    });
    expect((await getWorkOrder(a))?.status).toBe("open");
    expect((await getWorkOrder(b))?.status).toBe("assigned");
  });

  it("links assets with the first as primary and writes history + audit", async () => {
    const second = await createAsset(admin.id, {
      name: "Motor",
      siteId,
      criticality: "low",
    });
    const id = await createWorkOrder(admin.id, {
      ...baseWo(),
      assetIds: [assetId, second],
    });
    const detail = await getWorkOrderDetail(id);
    expect(detail?.assets).toHaveLength(2);
    expect(detail?.assets.find((a) => a.link.isPrimary)?.asset.id).toBe(assetId);
    expect(detail?.history).toHaveLength(1);
  });

  it("rejects archived assets and cross-site assets", async () => {
    await setAssetArchived(admin.id, assetId, true);
    await expect(
      createWorkOrder(admin.id, { ...baseWo(), assetIds: [assetId] }),
    ).rejects.toThrow(/archived/i);

    const site2 = await createSite(admin.id, { name: "Depot" });
    const farAsset = await createAsset(admin.id, {
      name: "Far",
      siteId: site2,
      criticality: "low",
    });
    await expect(
      createWorkOrder(admin.id, { ...baseWo(), assetIds: [farAsset] }),
    ).rejects.toThrow(/different site/i);
  });
});

describe("status lifecycle", () => {
  it("stamps actualStartAt on first in_progress and completedAt on completion; reopen clears it", async () => {
    const id = await createWorkOrder(admin.id, baseWo());
    await changeWorkOrderStatus(admin, id, "in_progress");
    const started = await getWorkOrder(id);
    expect(started?.actualStartAt).not.toBeNull();

    await changeWorkOrderStatus(admin, id, "completed", {
      completionNotes: "replaced seal",
      actualDowntimeMinutes: 45,
    });
    const done = await getWorkOrder(id);
    expect(done?.completedAt).not.toBeNull();
    expect(done?.completionNotes).toBe("replaced seal");
    expect(done?.actualDowntimeMinutes).toBe(45);

    await changeWorkOrderStatus(admin, id, "in_progress");
    const reopened = await getWorkOrder(id);
    expect(reopened?.completedAt).toBeNull();
    // actualStartAt survives (first-start semantics).
    expect(reopened?.actualStartAt?.getTime()).toBe(started?.actualStartAt?.getTime());

    const hist = await db
      .select()
      .from(workOrderStatusHistory)
      .where(eq(workOrderStatusHistory.workOrderId, id));
    expect(hist).toHaveLength(4); // created + 3 changes
  });

  it("technicians cannot cancel", async () => {
    const id = await createWorkOrder(admin.id, {
      ...baseWo(),
      assigneeIds: [tech.id],
    });
    await expect(
      changeWorkOrderStatus(tech, id, "canceled"),
    ).rejects.toThrow(/only managers/i);
    await changeWorkOrderStatus(manager, id, "canceled");
    expect((await getWorkOrder(id))?.status).toBe("canceled");
  });
});

describe("technician action boundaries (Scenario F)", () => {
  it("assigned tech can act; unassigned other tech cannot", async () => {
    const id = await createWorkOrder(admin.id, {
      ...baseWo(),
      assigneeIds: [tech.id],
    });
    expect(await canActOnWorkOrder(tech, id)).toBe(true);
    expect(await canActOnWorkOrder(otherTech, id)).toBe(false);
    await expect(
      changeWorkOrderStatus(otherTech, id, "in_progress"),
    ).rejects.toThrow(/assigned to someone else/i);
    await expect(
      addLabor(otherTech, id, { minutes: 30 }),
    ).rejects.toThrow(/assigned to someone else/i);
  });

  it("team membership grants action rights", async () => {
    const teamId = await createTeam(admin.id, { name: "Mechanics" });
    await updateTeam(admin.id, teamId, {
      name: "Mechanics",
      isActive: true,
      memberIds: [tech.id],
    });
    const id = await createWorkOrder(admin.id, {
      ...baseWo(),
      assignedTeamId: teamId,
    });
    expect(await canActOnWorkOrder(tech, id)).toBe(true);
    expect(await canActOnWorkOrder(otherTech, id)).toBe(false);
  });

  it("anyone (tech) can act on fully unassigned work", async () => {
    const id = await createWorkOrder(admin.id, baseWo());
    expect(await canActOnWorkOrder(tech, id)).toBe(true);
    expect(await canActOnWorkOrder(otherTech, id)).toBe(true);
  });

  it("managers can always act", async () => {
    const id = await createWorkOrder(admin.id, {
      ...baseWo(),
      assigneeIds: [tech.id],
    });
    expect(await canActOnWorkOrder(manager, id)).toBe(true);
  });
});

describe("labor and comments", () => {
  it("accumulates labor total and lists entries", async () => {
    const id = await createWorkOrder(admin.id, {
      ...baseWo(),
      assigneeIds: [tech.id],
    });
    await addLabor(tech, id, { minutes: 90, note: "diagnosis" });
    await addLabor(manager, id, { minutes: 30 });
    const detail = await getWorkOrderDetail(id);
    expect(detail?.laborTotal).toBe(120);
    expect(detail?.labor).toHaveLength(2);
  });

  it("rejects out-of-range labor", async () => {
    const id = await createWorkOrder(admin.id, baseWo());
    await expect(addLabor(admin, id, { minutes: 0 })).rejects.toThrow(
      ServiceError,
    );
    await expect(addLabor(admin, id, { minutes: 24 * 60 + 1 })).rejects.toThrow(
      ServiceError,
    );
  });

  it("comments attach to the WO", async () => {
    const id = await createWorkOrder(admin.id, baseWo());
    await addComment(tech, "work_order", id, "Found the leak");
    const detail = await getWorkOrderDetail(id);
    expect(detail?.comments).toHaveLength(1);
    expect(detail?.comments[0].comment.body).toBe("Found the leak");
  });
});

describe("update and listing", () => {
  it("syncs assignees and assets on update", async () => {
    const id = await createWorkOrder(admin.id, {
      ...baseWo(),
      assigneeIds: [tech.id],
      assetIds: [assetId],
    });
    await updateWorkOrder(admin.id, id, {
      title: "Fix the pump (updated)",
      siteId,
      workType: "reactive",
      priority: "high",
      assigneeIds: [otherTech.id],
      assetIds: [],
    });
    const detail = await getWorkOrderDetail(id);
    expect(detail?.wo.priority).toBe("high");
    expect(detail?.assignments.map((a) => a.userId)).toEqual([otherTech.id]);
    expect(detail?.assets).toHaveLength(0);
  });

  it("rejects self-parenting", async () => {
    const id = await createWorkOrder(admin.id, baseWo());
    await expect(
      updateWorkOrder(admin.id, id, {
        ...baseWo(),
        title: "x",
        parentWorkOrderId: id,
      }),
    ).rejects.toThrow(/own parent/i);
  });

  it("filters: default hides finished; mine; by asset", async () => {
    const a = await createWorkOrder(admin.id, {
      ...baseWo(),
      title: "Mine",
      assigneeIds: [tech.id],
      assetIds: [assetId],
    });
    const b = await createWorkOrder(admin.id, { ...baseWo(), title: "Done one" });
    await changeWorkOrderStatus(admin, b, "completed");

    const defaults = await listWorkOrders({});
    expect(defaults.map((r) => r.wo.id)).toEqual([a]);

    const all = await listWorkOrders({ includeDone: true });
    expect(all).toHaveLength(2);

    const mine = await listWorkOrders({ assigneeId: tech.id });
    expect(mine.map((r) => r.wo.id)).toEqual([a]);

    const byAsset = await listWorkOrders({ assetId, includeDone: true });
    expect(byAsset.map((r) => r.wo.id)).toEqual([a]);
  });
});

describe("Phase 12: downtime automation + notifications", () => {
  it("starting a downtime WO takes the asset down; completing restores it (Scenario E)", async () => {
    const { getAsset } = await import("@/server/services/assets");
    const id = await createWorkOrder(admin.id, {
      ...baseWo(),
      title: "Gearbox swap",
      assetIds: [assetId],
      plannedDowntimeMinutes: 120,
      assigneeIds: [tech.id],
    });
    expect((await getAsset(assetId))?.status).toBe("online");

    await changeWorkOrderStatus(tech, id, "in_progress");
    expect((await getAsset(assetId))?.status).toBe("planned_downtime");

    await changeWorkOrderStatus(tech, id, "completed", {
      actualDowntimeMinutes: 90,
    });
    expect((await getAsset(assetId))?.status).toBe("online");
    expect((await getWorkOrder(id))?.actualDowntimeMinutes).toBe(90);
  });

  it("downtime automation never overrides a manually-set asset state", async () => {
    const { changeAssetStatus, getAsset } = await import("@/server/services/assets");
    const id = await createWorkOrder(admin.id, {
      ...baseWo(),
      assetIds: [assetId],
      plannedDowntimeMinutes: 60,
    });
    // Asset already down for another reason — starting must not relabel it.
    await changeAssetStatus(admin.id, assetId, "unplanned_downtime");
    await changeWorkOrderStatus(admin, id, "in_progress");
    expect((await getAsset(assetId))?.status).toBe("unplanned_downtime");
    // And completing must not force it online either.
    await changeWorkOrderStatus(admin, id, "completed");
    expect((await getAsset(assetId))?.status).toBe("unplanned_downtime");
  });

  it("assignment notifies the assignee (create + update paths)", async () => {
    const { notifications } = await import("@/server/db/schema");
    const id = await createWorkOrder(admin.id, {
      ...baseWo(),
      assigneeIds: [tech.id],
    });
    let notes = await db
      .select()
      .from(notifications)
      .where(eq(notifications.userId, tech.id));
    expect(notes.some((n) => n.type === "work_order.assigned")).toBe(true);

    await updateWorkOrder(admin.id, id, {
      title: "Fix the pump",
      siteId,
      workType: "reactive",
      priority: "medium",
      assigneeIds: [tech.id, otherTech.id],
    });
    notes = await db
      .select()
      .from(notifications)
      .where(eq(notifications.userId, otherTech.id));
    expect(notes.some((n) => n.type === "work_order.assigned")).toBe(true);
  });
});

describe("Phase 14: parts & materials documentation", () => {
  it("assignee documents parts; costed lines total, uncosted still listed", async () => {
    const woId = await createWorkOrder(admin.id, {
      ...baseWo(),
      assigneeIds: [tech.id],
    });
    await addPart(tech, woId, { name: "Oil filter", quantity: 2, unitCost: 12.5 });
    await addPart(tech, woId, { name: "Shop rag", quantity: 1 });
    const detail = await getWorkOrderDetail(woId);
    expect(detail?.parts).toHaveLength(2);
    expect(detail?.partsCostTotal).toBe(25);
  });

  it("unassigned technician cannot add or remove parts", async () => {
    const woId = await createWorkOrder(admin.id, {
      ...baseWo(),
      assigneeIds: [tech.id],
    });
    await expect(
      addPart(otherTech, woId, { name: "Belt", quantity: 1 }),
    ).rejects.toThrow(/assigned to someone else/i);
    await addPart(tech, woId, { name: "Belt", quantity: 1, unitCost: 30 });
    const partId = (await getWorkOrderDetail(woId))!.parts[0].entry.id;
    await expect(removePart(otherTech, partId)).rejects.toThrow(ServiceError);
  });

  it("author or manager can remove a line; totals update", async () => {
    const woId = await createWorkOrder(admin.id, {
      ...baseWo(),
      assigneeIds: [tech.id],
    });
    await addPart(tech, woId, { name: "Gasket", quantity: 4, unitCost: 5 });
    await addPart(tech, woId, { name: "Sealant", quantity: 1, unitCost: 8 });
    let detail = (await getWorkOrderDetail(woId))!;
    expect(detail.partsCostTotal).toBe(28);
    await removePart(tech, detail.parts[0].entry.id); // author removes own line
    await removePart(manager, detail.parts[1].entry.id); // manager removes any
    detail = (await getWorkOrderDetail(woId))!;
    expect(detail.parts).toHaveLength(0);
    expect(detail.partsCostTotal).toBe(0);
  });

  it("rejects bad quantities and negative costs, and audits additions", async () => {
    const woId = await createWorkOrder(admin.id, {
      ...baseWo(),
      assigneeIds: [tech.id],
    });
    await expect(
      addPart(tech, woId, { name: "Bolt", quantity: 0 }),
    ).rejects.toThrow(/positive/i);
    await expect(
      addPart(tech, woId, { name: "Bolt", quantity: 1, unitCost: -4 }),
    ).rejects.toThrow(/zero or more/i);
    await addPart(tech, woId, { name: "Bolt", quantity: 8, unitCost: 0.35 });
    const { auditEvents } = await import("@/server/db/schema");
    const events = await db
      .select()
      .from(auditEvents)
      .where(eq(auditEvents.action, "work_order.part"));
    expect(events).toHaveLength(1);
    expect(events[0].summary).toContain("Bolt");
  });
});

/** org_settings is truncated between tests, so upsert rather than update. */
async function setApprovalRequired(on: boolean) {
  const { orgSettings } = await import("@/server/db/schema");
  await db
    .insert(orgSettings)
    .values({ id: 1, requireCompletionApproval: on })
    .onConflictDoUpdate({
      target: orgSettings.id,
      set: { requireCompletionApproval: on },
    });
}

describe("M2: pause/hold reasons, approval gate, and the labor timer", () => {
  it("pausing, holding, and waiting-for-parts each demand a reason", async () => {
    const id = await createWorkOrder(admin.id, {
      ...baseWo(),
      assigneeIds: [tech.id],
    });
    await changeWorkOrderStatus(tech, id, "in_progress");
    for (const s of ["paused", "on_hold", "waiting"] as const) {
      await expect(changeWorkOrderStatus(tech, id, s)).rejects.toThrow(
        /reason is required/i,
      );
    }
    await changeWorkOrderStatus(tech, id, "paused", { note: "lunch" });
    expect((await getWorkOrder(id))?.status).toBe("paused");
  });

  it("with approval off, a technician's completion completes the job", async () => {
    const id = await createWorkOrder(admin.id, {
      ...baseWo(),
      assigneeIds: [tech.id],
    });
    await changeWorkOrderStatus(tech, id, "completed", {
      completionNotes: "done",
    });
    expect((await getWorkOrder(id))?.status).toBe("completed");
  });

  it("with approval on, completion parks for review and only a manager clears it", async () => {
    await setApprovalRequired(true);
    try {
      const id = await createWorkOrder(admin.id, {
        ...baseWo(),
        assigneeIds: [tech.id],
      });
      await changeWorkOrderStatus(tech, id, "completed", {
        completionNotes: "replaced the seal",
        actualDowntimeMinutes: 30,
      });
      const parked = await getWorkOrder(id);
      expect(parked?.status).toBe("waiting_approval");
      // The write-up is kept for the manager to read.
      expect(parked?.completionNotes).toBe("replaced the seal");
      expect(parked?.actualDowntimeMinutes).toBe(30);
      expect(parked?.completedAt).toBeNull();

      // The technician cannot push it through themselves.
      await expect(
        changeWorkOrderStatus(tech, id, "completed"),
      ).rejects.toThrow(/waiting for a manager/i);

      // A manager can send it back…
      await changeWorkOrderStatus(manager, id, "in_progress", {
        note: "guard still off",
      });
      expect((await getWorkOrder(id))?.status).toBe("in_progress");
      // …or approve it.
      await changeWorkOrderStatus(tech, id, "completed");
      await changeWorkOrderStatus(manager, id, "completed");
      const done = await getWorkOrder(id);
      expect(done?.status).toBe("completed");
      expect(done?.completedAt).not.toBeNull();
    } finally {
      await setApprovalRequired(false);
    }
  });

  it("a manager's own completion skips the approval step", async () => {
    await setApprovalRequired(true);
    try {
      const id = await createWorkOrder(admin.id, baseWo());
      await changeWorkOrderStatus(manager, id, "completed");
      expect((await getWorkOrder(id))?.status).toBe("completed");
    } finally {
      await setApprovalRequired(false);
    }
  });

  it("the timer banks time across a pause and logs labor once stopped", async () => {
    const id = await createWorkOrder(admin.id, {
      ...baseWo(),
      assigneeIds: [tech.id],
    });
    await startTimer(tech, id);
    const active = await getActiveTimer(tech.id);
    expect(active?.workOrderId).toBe(id);

    // Backdate the start so measurable time has elapsed.
    const { workOrderTimers } = await import("@/server/db/schema");
    await db
      .update(workOrderTimers)
      .set({ startedAt: new Date(Date.now() - 25 * 60_000) })
      .where(eq(workOrderTimers.id, active!.id));

    await pauseTimer(tech);
    expect(await getActiveTimer(tech.id)).toBeNull();
    expect(await bankedTimerMinutes(tech.id, id)).toBeGreaterThanOrEqual(25);

    // Resuming picks the banked minutes back up.
    await startTimer(tech, id);
    const resumed = await getActiveTimer(tech.id);
    expect(resumed?.accumulatedMinutes).toBeGreaterThanOrEqual(25);

    const logged = await stopTimer(tech, "compressor rebuild");
    expect(logged).toBeGreaterThanOrEqual(25);
    const detail = await getWorkOrderDetail(id);
    expect(detail?.laborTotal).toBe(logged);
    expect(detail?.labor[0].entry.note).toBe("compressor rebuild");
    // Banked time is cleared, so the next session starts from zero.
    expect(await bankedTimerMinutes(tech.id, id)).toBe(0);
  });

  it("one running timer per person, enforced across work orders", async () => {
    const a = await createWorkOrder(admin.id, { ...baseWo(), assigneeIds: [tech.id] });
    const b = await createWorkOrder(admin.id, { ...baseWo(), assigneeIds: [tech.id] });
    await startTimer(tech, a);
    await expect(startTimer(tech, b)).rejects.toThrow(/already have a timer/i);
    // Starting again on the same job is a no-op, not an error.
    await startTimer(tech, a);
    expect((await getActiveTimer(tech.id))?.workOrderId).toBe(a);
    // A different technician's timer is independent (on their own job).
    const c = await createWorkOrder(admin.id, {
      ...baseWo(),
      assigneeIds: [otherTech.id],
    });
    await startTimer(otherTech, c);
    expect((await getActiveTimer(otherTech.id))?.workOrderId).toBe(c);
    expect((await getActiveTimer(tech.id))?.workOrderId).toBe(a);
  });

  it("refuses a timer on someone else's work or a finished job", async () => {
    const id = await createWorkOrder(admin.id, {
      ...baseWo(),
      assigneeIds: [tech.id],
    });
    await expect(startTimer(otherTech, id)).rejects.toThrow(
      /assigned to someone else/i,
    );
    await changeWorkOrderStatus(tech, id, "completed");
    await expect(startTimer(tech, id)).rejects.toThrow(/finished/i);
  });
});
