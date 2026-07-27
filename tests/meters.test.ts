import { beforeEach, describe, expect, it } from "vitest";
import { eq, sql } from "drizzle-orm";
import { db } from "@/server/db";
import { meterTriggerEvents, workOrders } from "@/server/db/schema";
import { createSite } from "@/server/services/sites";
import { createAsset } from "@/server/services/assets";
import {
  addReading,
  correctReading,
  createMeter,
  createTrigger,
  evaluateTriggers,
  getMeter,
  listReadings,
  setTriggerActive,
} from "@/server/services/meters";
import { changeWorkOrderStatus } from "@/server/services/workOrders";
import { makeUser, truncateAll } from "./helpers";
import type { SessionUser } from "@/server/auth/session";

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
}

function asSession(u: { id: number; username: string; role: SessionUser["role"] }): SessionUser {
  return { id: u.id, username: u.username, displayName: u.username, email: null, role: u.role };
}

let admin: SessionUser;
let tech: SessionUser;
let siteId: number;
let assetId: number;
let meterId: number;

beforeEach(async () => {
  await reset();
  admin = asSession(await makeUser({ role: "admin" }));
  tech = asSession(await makeUser({ role: "technician" }));
  siteId = await createSite(admin.id, { name: "Main" });
  assetId = await createAsset(admin.id, { name: "Generator", siteId, criticality: "high" });
  meterId = await createMeter(admin.id, {
    name: "Run hours",
    unit: "hours",
    assetId,
    mustIncrease: true,
  });
});

describe("readings", () => {
  it("records readings and updates the current value", async () => {
    await addReading(tech, meterId, { value: 100 });
    await addReading(tech, meterId, { value: 120.5 });
    expect(Number((await getMeter(meterId))?.currentValue)).toBe(120.5);
    expect(await listReadings(meterId)).toHaveLength(2);
  });

  it("rejects decreasing readings on monotonic meters unless rollover", async () => {
    await addReading(tech, meterId, { value: 100 });
    await expect(addReading(tech, meterId, { value: 90 })).rejects.toThrow(
      /only counts up/i,
    );
    await addReading(tech, meterId, { value: 5, isRollover: true });
    expect(Number((await getMeter(meterId))?.currentValue)).toBe(5);
  });

  it("rejects impossible magnitudes", async () => {
    await expect(
      addReading(tech, meterId, { value: 1e12 }),
    ).rejects.toThrow(/impossible/i);
  });

  it("corrections void the original, keep history, and recompute current", async () => {
    await addReading(tech, meterId, { value: 100 });
    const { readingId } = await addReading(tech, meterId, { value: 200 });
    await expect(
      correctReading(admin, readingId, { value: 150, note: "" }),
    ).rejects.toThrow(/note is required/i);
    await correctReading(admin, readingId, { value: 150, note: "typo" });

    const readings = await listReadings(meterId);
    expect(readings).toHaveLength(3); // original(voided) + correction + first
    const voided = readings.find((r) => r.id === readingId);
    expect(voided?.isVoided).toBe(true);
    const correction = readings.find((r) => r.correctsReadingId === readingId);
    expect(Number(correction?.value)).toBe(150);
    expect(Number((await getMeter(meterId))?.currentValue)).toBe(150);
    // Double-correcting the same reading is refused.
    await expect(
      correctReading(admin, readingId, { value: 140, note: "again" }),
    ).rejects.toThrow(/already corrected/i);
  });
});

describe("threshold triggers (Scenario C)", () => {
  let triggerId: number;
  beforeEach(async () => {
    triggerId = await createTrigger(admin.id, meterId, {
      name: "Overheat check",
      type: "threshold",
      threshold: 500,
      skipIfOpen: true,
      woTitle: "Inspect generator at 500h",
      priority: "high",
    });
  });

  it("readings below the trigger create nothing", async () => {
    await addReading(tech, meterId, { value: 100 });
    await addReading(tech, meterId, { value: 499 });
    expect(await db.select().from(workOrders)).toHaveLength(0);
  });

  it("a qualifying reading creates exactly one WO linked to meter and asset", async () => {
    await addReading(tech, meterId, { value: 400 });
    const { firedWorkOrderIds } = await addReading(tech, meterId, { value: 505 });
    expect(firedWorkOrderIds).toHaveLength(1);

    const wos = await db.select().from(workOrders);
    expect(wos).toHaveLength(1);
    expect(wos[0].source).toBe("meter");
    expect(wos[0].title).toBe("Inspect generator at 500h");
    expect(wos[0].siteId).toBe(siteId);
    expect(wos[0].description).toContain("Run hours");

    const events = await db
      .select()
      .from(meterTriggerEvents)
      .where(eq(meterTriggerEvents.triggerId, triggerId));
    expect(events).toHaveLength(1);
    expect(events[0].workOrderId).toBe(wos[0].id);
  });

  it("reprocessing the same reading does not create a duplicate", async () => {
    await addReading(tech, meterId, { value: 400 });
    const { readingId } = await addReading(tech, meterId, { value: 505 });
    // Simulate a retry / double evaluation of the same reading.
    const meter = await getMeter(meterId);
    const again = await evaluateTriggers(meter!, readingId, 505, 400);
    expect(again).toHaveLength(0);
    expect(await db.select().from(workOrders)).toHaveLength(1);
  });

  it("does not re-fire while above threshold; re-arms after dropping below (non-monotonic)", async () => {
    const tempMeter = await createMeter(admin.id, {
      name: "Coolant temp",
      unit: "F",
      assetId,
      mustIncrease: false,
    });
    await createTrigger(admin.id, tempMeter, {
      name: "Overtemp",
      type: "threshold",
      threshold: 210,
      skipIfOpen: false,
      woTitle: "Check cooling system",
      priority: "critical",
    });
    await addReading(tech, tempMeter, { value: 215 }); // fires (no previous)
    await addReading(tech, tempMeter, { value: 220 }); // still above → no fire
    expect(await db.select().from(workOrders)).toHaveLength(1);
    await addReading(tech, tempMeter, { value: 180 }); // re-arm
    await addReading(tech, tempMeter, { value: 212 }); // fires again
    expect(await db.select().from(workOrders)).toHaveLength(2);
  });

  it("skipIfOpen suppresses firing while the generated WO is open", async () => {
    const tempMeter = await createMeter(admin.id, {
      name: "Pressure",
      unit: "psi",
      assetId,
      mustIncrease: false,
    });
    await createTrigger(admin.id, tempMeter, {
      name: "Overpressure",
      type: "threshold",
      threshold: 100,
      skipIfOpen: true,
      woTitle: "Relief valve check",
      priority: "high",
    });
    await addReading(tech, tempMeter, { value: 120 }); // fires
    await addReading(tech, tempMeter, { value: 80 });
    await addReading(tech, tempMeter, { value: 130 }); // would fire, but WO open
    expect(await db.select().from(workOrders)).toHaveLength(1);

    const [wo] = await db.select().from(workOrders);
    await changeWorkOrderStatus(admin, wo.id, "completed");
    await addReading(tech, tempMeter, { value: 70 });
    await addReading(tech, tempMeter, { value: 140 }); // now fires again
    expect(await db.select().from(workOrders)).toHaveLength(2);
  });

  it("disabled triggers never fire", async () => {
    await setTriggerActive(admin.id, triggerId, false);
    await addReading(tech, meterId, { value: 600 });
    expect(await db.select().from(workOrders)).toHaveLength(0);
  });
});

describe("interval triggers (usage-based PM)", () => {
  it("fires every N units, collapsing missed intervals into one WO", async () => {
    await addReading(tech, meterId, { value: 100 });
    await createTrigger(admin.id, meterId, {
      name: "250h service",
      type: "interval",
      intervalValue: 250,
      skipIfOpen: false,
      woTitle: "250-hour service",
      priority: "medium",
    });
    // Baseline is 100 → next fire at 350.
    await addReading(tech, meterId, { value: 300 });
    expect(await db.select().from(workOrders)).toHaveLength(0);

    await addReading(tech, meterId, { value: 360 });
    expect(await db.select().from(workOrders)).toHaveLength(1);

    // Jump across TWO intervals (360 → 900 crosses 600 and 850): one WO,
    // watermark advances past both.
    await addReading(tech, meterId, { value: 900 });
    expect(await db.select().from(workOrders)).toHaveLength(2);

    await addReading(tech, meterId, { value: 1000 });
    expect(await db.select().from(workOrders)).toHaveLength(2); // next at 1100
    await addReading(tech, meterId, { value: 1105 });
    expect(await db.select().from(workOrders)).toHaveLength(3);
  });
});
