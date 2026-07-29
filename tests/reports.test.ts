import { beforeEach, describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";
import { db } from "@/server/db";
import { orgSettings, workOrders } from "@/server/db/schema";
import { eq } from "drizzle-orm";
import { createSite } from "@/server/services/sites";
import { createAsset } from "@/server/services/assets";
import {
  addLabor,
  changeWorkOrderStatus,
  createWorkOrder,
} from "@/server/services/workOrders";
import { createRequest, decideRequest } from "@/server/services/requests";
import {
  backlog,
  completedByTechnician,
  completionStats,
  downtimeByAsset,
  managerWarnings,
  pmCompliance,
  preventiveVsReactive,
  repeatFailures,
  requestStats,
  woCountsByStatus,
} from "@/server/services/reports";
import { createPlan, runPmTick } from "@/server/services/pm";
import { changeAssetStatus } from "@/server/services/assets";
import { todayInTimezone, addDays } from "@/lib/format";
import { makeUser, truncateAll } from "./helpers";
import type { SessionUser } from "@/server/auth/session";

const TZ = "America/Chicago";

async function reset() {
  await truncateAll();
  await db.execute(sql`
    TRUNCATE TABLE meter_trigger_events, meter_triggers, meter_readings,
      meters, pm_occurrences, pm_plans, notifications, work_requests,
      procedure_responses, wo_procedure_instances, procedure_versions,
      procedure_templates, comments, work_order_labor,
      work_order_status_history, work_order_assignments, work_order_assets,
      work_orders, assets, locations, sites RESTART IDENTITY CASCADE
  `);
  await db.insert(orgSettings).values({ id: 1, name: "T", timezone: TZ });
}

function asSession(u: { id: number; username: string; role: SessionUser["role"] }): SessionUser {
  return { id: u.id, username: u.username, displayName: u.username, email: null, mustChangePassword: false, role: u.role };
}

let admin: SessionUser;
let tech: SessionUser;
let siteId: number;
let assetId: number;

beforeEach(async () => {
  await reset();
  admin = asSession(await makeUser({ role: "admin" }));
  tech = asSession(await makeUser({ role: "technician" }));
  siteId = await createSite(admin.id, { name: "Main" });
  assetId = await createAsset(admin.id, { name: "Pump", siteId, criticality: "critical" });
});

describe("KPI definitions", () => {
  it("canceled work orders are NEVER counted as completed", async () => {
    const a = await createWorkOrder(admin.id, {
      title: "Done",
      siteId,
      workType: "reactive",
      priority: "medium",
      assigneeIds: [tech.id],
    });
    const b = await createWorkOrder(admin.id, {
      title: "Canceled",
      siteId,
      workType: "reactive",
      priority: "medium",
      assigneeIds: [tech.id],
    });
    await changeWorkOrderStatus(admin, a, "completed");
    await changeWorkOrderStatus(admin, b, "canceled");

    const stats = await completionStats();
    expect(stats.completed).toBe(1);
    const byTech = await completedByTechnician();
    expect(byTech).toHaveLength(1);
    expect(byTech[0].completed).toBe(1);

    const byStatus = await woCountsByStatus();
    expect(byStatus.find((r) => r.key === "completed")?.count).toBe(1);
    expect(byStatus.find((r) => r.key === "canceled")?.count).toBe(1);
  });

  it("backlog counts open + overdue + unassigned correctly", async () => {
    await createWorkOrder(admin.id, {
      title: "Open unassigned",
      siteId,
      workType: "reactive",
      priority: "medium",
    });
    await createWorkOrder(admin.id, {
      title: "Overdue assigned",
      siteId,
      workType: "reactive",
      priority: "medium",
      assigneeIds: [tech.id],
      dueAt: new Date(Date.now() - 86400000),
    });
    const done = await createWorkOrder(admin.id, {
      title: "Done",
      siteId,
      workType: "reactive",
      priority: "medium",
    });
    await changeWorkOrderStatus(admin, done, "completed");

    const b = await backlog();
    expect(b.open).toBe(2);
    expect(b.overdue).toBe(1);
    expect(b.unassigned).toBe(1);
  });

  it("labor minutes aggregate per technician", async () => {
    const wo = await createWorkOrder(admin.id, {
      title: "Job",
      siteId,
      workType: "reactive",
      priority: "medium",
      assigneeIds: [tech.id],
    });
    await addLabor(tech, wo, { minutes: 90 });
    await changeWorkOrderStatus(tech, wo, "completed");
    const rows = await completedByTechnician();
    expect(rows[0].laborMinutes).toBe(90);
  });

  it("preventive vs reactive buckets by work type", async () => {
    await createWorkOrder(admin.id, { title: "P", siteId, workType: "preventive", priority: "low" });
    await createWorkOrder(admin.id, { title: "I", siteId, workType: "inspection", priority: "low" });
    await createWorkOrder(admin.id, { title: "R", siteId, workType: "reactive", priority: "low" });
    const r = await preventiveVsReactive();
    expect(r.preventive).toBe(2);
    expect(r.reactive).toBe(1);
  });

  it("downtime by asset sums planned vs actual for completed work", async () => {
    const wo = await createWorkOrder(admin.id, {
      title: "Downtime job",
      siteId,
      workType: "reactive",
      priority: "high",
      assetIds: [assetId],
      plannedDowntimeMinutes: 60,
    });
    await changeWorkOrderStatus(admin, wo, "completed", {
      actualDowntimeMinutes: 95,
    });
    const rows = await downtimeByAsset();
    expect(rows).toHaveLength(1);
    expect(rows[0].plannedMinutes).toBe(60);
    expect(rows[0].actualMinutes).toBe(95);
  });

  it("repeat failures require ≥2 completed reactive/corrective WOs on the asset", async () => {
    for (const title of ["Fail 1", "Fail 2"]) {
      const wo = await createWorkOrder(admin.id, {
        title,
        siteId,
        workType: "reactive",
        priority: "medium",
        assetIds: [assetId],
      });
      await changeWorkOrderStatus(admin, wo, "completed");
    }
    const rows = await repeatFailures();
    expect(rows).toHaveLength(1);
    expect(rows[0].failures).toBe(2);
  });

  it("request stats: approval rate and response time exclude undecided", async () => {
    const requester = asSession(await makeUser({ role: "requester" }));
    const r1 = await createRequest({
      title: "A",
      siteId,
      priority: "medium",
      requesterId: requester.id,
    });
    const r2 = await createRequest({
      title: "B",
      siteId,
      priority: "medium",
      requesterId: requester.id,
    });
    await createRequest({
      title: "C (undecided)",
      siteId,
      priority: "medium",
      requesterId: requester.id,
    });
    await decideRequest(admin, r1, "approved");
    await decideRequest(admin, r2, "declined", "no");
    const stats = await requestStats();
    expect(stats.total).toBe(3);
    expect(stats.approvalRate).toBe(0.5);
  });

  it("PM compliance counts on-time vs open occurrences", async () => {
    const today = todayInTimezone(TZ);
    await createPlan(admin.id, {
      name: "PM",
      siteId,
      assetId,
      priority: "medium",
      basis: "fixed",
      recurUnit: "week",
      recurInterval: 1,
      leadDays: 0,
      startDate: today,
    });
    await runPmTick();
    let c = await pmCompliance();
    expect(c.total).toBe(1);
    expect(c.open).toBe(1);
    expect(c.onTime).toBe(0);

    const [wo] = await db.select().from(workOrders).where(eq(workOrders.source, "pm"));
    await changeWorkOrderStatus(admin, wo.id, "completed");
    c = await pmCompliance();
    expect(c.onTime).toBe(1);
    expect(c.complianceRate).toBe(1);
  });
});

describe("manager warnings (§11)", () => {
  it("flags offline-after-completion, overdue PM, and downtime conflicts", async () => {
    const today = todayInTimezone(TZ);

    // Offline asset whose only WO is completed.
    const wo = await createWorkOrder(admin.id, {
      title: "Fix pump",
      siteId,
      workType: "reactive",
      priority: "high",
      assetIds: [assetId],
    });
    await changeAssetStatus(admin.id, assetId, "offline");
    await changeWorkOrderStatus(admin, wo, "completed");

    // Overdue PM plan.
    await createPlan(admin.id, {
      name: "Overdue plan",
      siteId,
      priority: "medium",
      basis: "fixed",
      recurUnit: "month",
      recurInterval: 1,
      leadDays: 0,
      startDate: addDays(today, -10),
      isPaused: true, // paused so the tick doesn't consume it…
    });
    // …unpause directly to simulate an overdue, ungenerated plan.
    await db.execute(sql`UPDATE pm_plans SET is_paused = false`);

    // Two open downtime WOs on a second critical asset (kept separate so the
    // offline-after-completion check on the first asset stays clean).
    const asset2 = await createAsset(admin.id, {
      name: "Press",
      siteId,
      criticality: "critical",
    });
    for (const t of ["DT 1", "DT 2"]) {
      await createWorkOrder(admin.id, {
        title: t,
        siteId,
        workType: "project",
        priority: "high",
        assetIds: [asset2],
        plannedDowntimeMinutes: 120,
      });
    }

    const w = await managerWarnings(today);
    expect(w.offlineAfterCompletion.map((a) => a.assetNumber)).toContain("A-0001");
    expect(w.overduePm.map((p) => p.name)).toContain("Overdue plan");
    expect(w.downtimeConflicts).toHaveLength(1);
    expect(w.downtimeConflicts[0].openDowntimeWos).toBe(2);
  });

  it("offline warning clears while work is still open", async () => {
    await createWorkOrder(admin.id, {
      title: "Fixing now",
      siteId,
      workType: "reactive",
      priority: "high",
      assetIds: [assetId],
    });
    await changeAssetStatus(admin.id, assetId, "offline");
    const w = await managerWarnings(todayInTimezone(TZ));
    expect(w.offlineAfterCompletion).toHaveLength(0);
  });
});
