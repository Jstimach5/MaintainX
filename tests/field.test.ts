import { beforeEach, describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";
import { db } from "@/server/db";
import { createSite } from "@/server/services/sites";
import { createAsset } from "@/server/services/assets";
import {
  changeWorkOrderStatus,
  createWorkOrder,
} from "@/server/services/workOrders";
import { createRequest } from "@/server/services/requests";
import { fieldSummary } from "@/server/services/field";
import { todayInTimezone } from "@/lib/format";
import { makeUser, truncateAll } from "./helpers";
import type { SessionUser } from "@/server/auth/session";

const TZ = "America/Chicago";

async function reset() {
  await truncateAll();
  await db.execute(sql`
    TRUNCATE TABLE notifications, work_requests, comments, work_order_parts,
      work_order_labor, work_order_status_history, work_order_assignments,
      work_order_assets, work_orders, assets, locations, sites
    RESTART IDENTITY CASCADE
  `);
}

function asSession(u: {
  id: number;
  username: string;
  role: SessionUser["role"];
}): SessionUser {
  return {
    id: u.id,
    username: u.username,
    displayName: u.username,
    email: null,
    role: u.role,
  };
}

let admin: SessionUser;
let tech: SessionUser;
let otherTech: SessionUser;
let siteId: number;

beforeEach(async () => {
  await reset();
  admin = asSession(await makeUser({ role: "admin" }));
  tech = asSession(await makeUser({ role: "technician" }));
  otherTech = asSession(await makeUser({ role: "technician" }));
  siteId = await createSite(admin.id, { name: "Main" });
});

const base = () => ({
  title: "Job",
  siteId,
  workType: "reactive" as const,
  priority: "medium" as const,
});

/** Noon today in the org timezone, safely inside the calendar day. */
function todayAtNoon(): Date {
  const today = todayInTimezone(TZ);
  return new Date(`${today}T18:00:00Z`); // 12:00 in America/Chicago (CDT/CST ±1h)
}

describe("field home summary", () => {
  it("counts only the signed-in technician's own work", async () => {
    await createWorkOrder(admin.id, { ...base(), assigneeIds: [tech.id] });
    await createWorkOrder(admin.id, { ...base(), assigneeIds: [tech.id] });
    await createWorkOrder(admin.id, { ...base(), assigneeIds: [otherTech.id] });

    const mine = await fieldSummary(tech, todayInTimezone(TZ), TZ);
    const theirs = await fieldSummary(otherTech, todayInTimezone(TZ), TZ);
    expect(mine.mine).toHaveLength(2);
    expect(theirs.mine).toHaveLength(1);
  });

  it("buckets today, overdue, in progress, and preventive work", async () => {
    const todayJob = await createWorkOrder(admin.id, {
      ...base(),
      title: "Due today",
      assigneeIds: [tech.id],
      dueAt: todayAtNoon(),
    });
    await createWorkOrder(admin.id, {
      ...base(),
      title: "Overdue",
      assigneeIds: [tech.id],
      dueAt: new Date(Date.now() - 48 * 3600 * 1000),
    });
    await createWorkOrder(admin.id, {
      ...base(),
      title: "Routine",
      workType: "preventive",
      assigneeIds: [tech.id],
    });
    await changeWorkOrderStatus(tech, todayJob, "in_progress");

    const s = await fieldSummary(tech, todayInTimezone(TZ), TZ);
    expect(s.today.map((w) => w.title)).toContain("Due today");
    expect(s.overdue.map((w) => w.title)).toContain("Overdue");
    expect(s.inProgress.map((w) => w.title)).toEqual(["Due today"]);
    expect(s.pmDue.map((w) => w.title)).toEqual(["Routine"]);
  });

  it("lists unassigned work as available, and drops it once assigned", async () => {
    await createWorkOrder(admin.id, { ...base(), title: "Up for grabs" });
    let s = await fieldSummary(tech, todayInTimezone(TZ), TZ);
    expect(s.available.map((w) => w.title)).toEqual(["Up for grabs"]);

    await createWorkOrder(admin.id, {
      ...base(),
      title: "Taken",
      assigneeIds: [otherTech.id],
    });
    s = await fieldSummary(tech, todayInTimezone(TZ), TZ);
    expect(s.available.map((w) => w.title)).toEqual(["Up for grabs"]);
  });

  it("shows the technician's own submitted requests", async () => {
    const assetId = await createAsset(admin.id, {
      name: "Pump",
      siteId,
      criticality: "medium",
    });
    await createRequest({
      title: "Leaking seal",
      description: "Dripping",
      siteId,
      assetId,
      priority: "medium",
      requesterId: tech.id,
    });
    await createRequest({
      title: "Someone else's",
      description: "Not mine",
      siteId,
      priority: "low",
      requesterId: otherTech.id,
    });

    const s = await fieldSummary(tech, todayInTimezone(TZ), TZ);
    expect(s.myRequests.map((r) => r.title)).toEqual(["Leaking seal"]);
  });

  it("excludes finished work from every bucket", async () => {
    const id = await createWorkOrder(admin.id, {
      ...base(),
      title: "Done",
      assigneeIds: [tech.id],
      dueAt: todayAtNoon(),
    });
    await changeWorkOrderStatus(tech, id, "completed");
    const s = await fieldSummary(tech, todayInTimezone(TZ), TZ);
    expect(s.mine).toHaveLength(0);
    expect(s.today).toHaveLength(0);
    expect(s.overdue).toHaveLength(0);
  });
});
