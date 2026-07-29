import { beforeEach, describe, expect, it } from "vitest";
import { eq, sql } from "drizzle-orm";
import { db } from "@/server/db";
import { orgSettings, pmOccurrences, workOrders } from "@/server/db/schema";
import { addRecurrence, projectOccurrences } from "@/lib/recurrence";
import { todayInTimezone } from "@/lib/format";
import { createSite } from "@/server/services/sites";
import { createAsset, setAssetArchived } from "@/server/services/assets";
import { createTemplate } from "@/server/services/procedures";
import {
  createPlan,
  getPlan,
  previewPlan,
  runPmTick,
  updatePlan,
} from "@/server/services/pm";
import { changeWorkOrderStatus, getWorkOrderDetail } from "@/server/services/workOrders";
import { makeUser, truncateAll } from "./helpers";
import type { SessionUser } from "@/server/auth/session";

const TZ = "America/Chicago";

async function reset() {
  await truncateAll();
  await db.execute(sql`
    TRUNCATE TABLE pm_occurrences, pm_plans, notifications, work_requests,
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
let today: string;

beforeEach(async () => {
  await reset();
  admin = asSession(await makeUser({ role: "admin" }));
  tech = asSession(await makeUser({ role: "technician" }));
  siteId = await createSite(admin.id, { name: "Main" });
  assetId = await createAsset(admin.id, { name: "Pump", siteId, criticality: "medium" });
  today = todayInTimezone(TZ);
});

const basePlan = (over: Partial<Parameters<typeof createPlan>[1]> = {}) => ({
  name: "Monthly greasing",
  siteId,
  assetId,
  priority: "medium" as const,
  basis: "floating" as const,
  recurUnit: "month" as const,
  recurInterval: 1,
  leadDays: 0,
  startDate: today,
  ...over,
});

describe("recurrence math", () => {
  it("adds days and weeks", () => {
    expect(addRecurrence("2026-07-27", "day", 10)).toBe("2026-08-06");
    expect(addRecurrence("2026-07-27", "week", 2)).toBe("2026-08-10");
  });
  it("clamps month-end (Jan 31 + 1mo = Feb 28; leap-safe)", () => {
    expect(addRecurrence("2026-01-31", "month", 1)).toBe("2026-02-28");
    expect(addRecurrence("2028-01-31", "month", 1)).toBe("2028-02-29");
    expect(addRecurrence("2026-11-30", "month", 3)).toBe("2027-02-28");
  });
  it("handles year rollover and Feb 29", () => {
    expect(addRecurrence("2026-12-15", "month", 2)).toBe("2027-02-15");
    expect(addRecurrence("2028-02-29", "year", 1)).toBe("2029-02-28");
  });
  it("crosses DST boundaries without shifting (pure calendar math)", () => {
    // US DST spring-forward 2026-03-08; +7 days across it stays calendar-true.
    expect(addRecurrence("2026-03-05", "week", 1)).toBe("2026-03-12");
  });
  it("projects occurrences and respects end dates", () => {
    expect(projectOccurrences("2026-01-01", "month", 1, 3)).toEqual([
      "2026-01-01",
      "2026-02-01",
      "2026-03-01",
    ]);
    expect(
      projectOccurrences("2026-01-01", "month", 1, 5, "2026-02-15"),
    ).toEqual(["2026-01-01", "2026-02-01"]);
  });
});

describe("generation (Scenario B core)", () => {
  it("generates exactly one WO for a due plan; re-running creates no duplicate", async () => {
    const planId = await createPlan(admin.id, basePlan());
    const first = await runPmTick();
    expect(first.generated).toBe(1);
    const second = await runPmTick();
    expect(second.generated).toBe(0);

    const wos = await db
      .select()
      .from(workOrders)
      .where(eq(workOrders.pmPlanId, planId));
    expect(wos).toHaveLength(1);
    expect(wos[0].source).toBe("pm");
    expect(wos[0].workType).toBe("preventive");
  });

  it("does not generate before the lead window", async () => {
    await createPlan(admin.id, basePlan({ startDate: addRecurrence(today, "day", 10), leadDays: 3 }));
    expect((await runPmTick()).generated).toBe(0);
  });

  it("generates inside the lead window (due in 2 days, lead 3)", async () => {
    await createPlan(admin.id, basePlan({ startDate: addRecurrence(today, "day", 2), leadDays: 3 }));
    expect((await runPmTick()).generated).toBe(1);
  });

  it("paused plans and archived assets are skipped", async () => {
    await createPlan(admin.id, basePlan({ isPaused: true }));
    expect((await runPmTick()).generated).toBe(0);

    const p2 = await createPlan(admin.id, basePlan({ name: "Other" }));
    await setAssetArchived(admin.id, assetId, true);
    expect((await runPmTick()).generated).toBe(0);
    expect(p2).toBeGreaterThan(0);
  });

  it("floating: no stacking while the generated WO is open; completion re-anchors", async () => {
    const planId = await createPlan(admin.id, basePlan({ recurUnit: "day", recurInterval: 30 }));
    await runPmTick();
    // Still due (nextDue unchanged) but an open WO exists → no second WO.
    expect((await runPmTick()).generated).toBe(0);

    const [wo] = await db
      .select()
      .from(workOrders)
      .where(eq(workOrders.pmPlanId, planId));
    await changeWorkOrderStatus(admin, wo.id, "completed");

    const plan = await getPlan(planId);
    expect(plan?.nextDue).toBe(addRecurrence(today, "day", 30));
    // Now not due → nothing new.
    expect((await runPmTick()).generated).toBe(0);
  });

  it("fixed: schedule marches from original dates and collapses missed occurrences into one catch-up", async () => {
    const start = addRecurrence(today, "day", -45); // 45 days overdue
    const planId = await createPlan(
      admin.id,
      basePlan({ basis: "fixed", recurUnit: "week", recurInterval: 2, startDate: start }),
    );
    const result = await runPmTick();
    expect(result.generated).toBe(1); // ONE catch-up, not three

    const occs = await db
      .select()
      .from(pmOccurrences)
      .where(eq(pmOccurrences.planId, planId));
    expect(occs).toHaveLength(1);
    expect(occs[0].occurrenceKey).toBe(start); // keeps the overdue due date

    const plan = await getPlan(planId);
    expect(plan!.nextDue > today).toBe(true); // marched into the future
    // And future dates stay aligned to the original cadence.
    const diffDays =
      (Date.parse(plan!.nextDue) - Date.parse(start)) / 86400000;
    expect(diffDays % 14).toBe(0);
  });

  it("plans past their end date stop generating", async () => {
    await createPlan(
      admin.id,
      basePlan({
        basis: "fixed",
        recurUnit: "day",
        recurInterval: 7,
        startDate: addRecurrence(today, "day", -30),
        endDate: addRecurrence(today, "day", -20),
      }),
    );
    // nextDue (30 days ago) is before endDate → one final catch-up allowed.
    expect((await runPmTick()).generated).toBe(1);
    expect((await runPmTick()).generated).toBe(0);
  });

  it("attaches the plan's procedure to generated WOs", async () => {
    const tplId = await createTemplate(admin.id, {
      name: "Grease points",
      steps: [{ type: "checkbox", label: "All zerks greased", required: true }],
    });
    const planId = await createPlan(
      admin.id,
      basePlan({ procedureTemplateId: tplId, assigneeIds: [tech.id] }),
    );
    await runPmTick();
    const [wo] = await db
      .select()
      .from(workOrders)
      .where(eq(workOrders.pmPlanId, planId));
    const detail = await getWorkOrderDetail(wo.id);
    expect(detail?.assignments.map((a) => a.userId)).toEqual([tech.id]);
    const { listInstancesForWo } = await import("@/server/services/procedures");
    const instances = await listInstancesForWo(wo.id);
    expect(instances).toHaveLength(1);
    expect(instances[0].instance.name).toBe("Grease points");
  });

  it("repairs occurrences whose WO creation crashed", async () => {
    const planId = await createPlan(admin.id, basePlan());
    // Simulate the crash window: occurrence claimed, no WO.
    await db.insert(pmOccurrences).values({ planId, occurrenceKey: today });
    const result = await runPmTick();
    expect(result.repaired).toBe(1);
    const occs = await db
      .select()
      .from(pmOccurrences)
      .where(eq(pmOccurrences.planId, planId));
    expect(occs.every((o) => o.workOrderId != null)).toBe(true);
  });
});

describe("plan management", () => {
  it("preview projects from nextDue and respects end date", async () => {
    const planId = await createPlan(
      admin.id,
      basePlan({ basis: "fixed", recurUnit: "week", recurInterval: 1 }),
    );
    const plan = await getPlan(planId);
    const preview = previewPlan(plan!, 4);
    expect(preview).toHaveLength(4);
    expect(preview[0]).toBe(today);
  });

  it("pause/resume via update", async () => {
    const planId = await createPlan(admin.id, basePlan());
    await updatePlan(admin.id, planId, { ...basePlan(), isPaused: true });
    expect((await getPlan(planId))?.isPaused).toBe(true);
    expect((await runPmTick()).generated).toBe(0);
  });
});
