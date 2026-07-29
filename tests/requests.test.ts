import { beforeEach, describe, expect, it } from "vitest";
import { eq, sql } from "drizzle-orm";
import { db } from "@/server/db";
import { notifications, workRequests } from "@/server/db/schema";
import { createSite } from "@/server/services/sites";
import { createAsset } from "@/server/services/assets";
import {
  convertRequest,
  createRequest,
  decideRequest,
  getRequest,
  listRequests,
  setUnderReview,
} from "@/server/services/requests";
import {
  changeWorkOrderStatus,
  createWorkOrder,
  getWorkOrder,
} from "@/server/services/workOrders";
import {
  attachProcedure,
  createTemplate,
  respondToStep,
} from "@/server/services/procedures";
import { ServiceError } from "@/server/services/users";
import { makeUser, truncateAll } from "./helpers";
import type { SessionUser } from "@/server/auth/session";

async function reset() {
  await truncateAll();
  await db.execute(sql`
    TRUNCATE TABLE notifications, work_requests, procedure_responses,
      wo_procedure_instances, procedure_versions, procedure_templates,
      comments, work_order_labor, work_order_status_history,
      work_order_assignments, work_order_assets, work_orders, assets,
      locations, sites RESTART IDENTITY CASCADE
  `);
}

function asSession(u: { id: number; username: string; role: SessionUser["role"] }): SessionUser {
  return { id: u.id, username: u.username, displayName: u.username, email: null, mustChangePassword: false, role: u.role };
}

let admin: SessionUser;
let manager: SessionUser;
let requester: SessionUser;
let tech: SessionUser;
let siteId: number;
let assetId: number;

beforeEach(async () => {
  await reset();
  admin = asSession(await makeUser({ role: "admin" }));
  manager = asSession(await makeUser({ role: "manager" }));
  requester = asSession(await makeUser({ role: "requester" }));
  tech = asSession(await makeUser({ role: "technician" }));
  siteId = await createSite(admin.id, { name: "Main" });
  assetId = await createAsset(admin.id, {
    name: "Pump",
    siteId,
    criticality: "medium",
  });
});

const baseReq = () => ({
  title: "Leaking pump",
  siteId,
  assetId,
  priority: "medium" as const,
  requesterId: requester.id,
  requesterName: "Riley Requester",
});

describe("request lifecycle", () => {
  it("assigns request numbers and notifies managers on submit", async () => {
    const id = await createRequest(baseReq());
    expect((await getRequest(id))?.requestNumber).toBe("REQ-0001");
    // Managers + admins were notified in-app.
    const notes = await db
      .select()
      .from(notifications)
      .where(eq(notifications.type, "request.submitted"));
    const notified = notes.map((n) => n.userId).sort();
    expect(notified).toContain(admin.id);
    expect(notified).toContain(manager.id);
    expect(notified).not.toContain(requester.id);
  });

  it("decline requires a reason and notifies the requester", async () => {
    const id = await createRequest(baseReq());
    await expect(decideRequest(manager, id, "declined")).rejects.toThrow(
      /reason/i,
    );
    await decideRequest(manager, id, "declined", "No budget this quarter");
    expect((await getRequest(id))?.status).toBe("declined");
    const notes = await db
      .select()
      .from(notifications)
      .where(eq(notifications.userId, requester.id));
    expect(notes.some((n) => n.type === "request.declined")).toBe(true);
  });

  it("conversion requires approval first", async () => {
    const id = await createRequest(baseReq());
    await expect(convertRequest(manager, id)).rejects.toThrow(/approve/i);
  });

  it("converts an approved request into exactly one WO and blocks repeats", async () => {
    const id = await createRequest(baseReq());
    await setUnderReview(manager, id);
    await decideRequest(manager, id, "approved");
    const woId = await convertRequest(manager, id);

    const req = await getRequest(id);
    expect(req?.status).toBe("converted");
    expect(req?.convertedWorkOrderId).toBe(woId);

    const wo = await getWorkOrder(woId);
    expect(wo?.source).toBe("request");
    expect(wo?.requesterId).toBe(requester.id);
    expect(wo?.title).toBe("Leaking pump");

    await expect(convertRequest(manager, id)).rejects.toThrow(/already converted/i);
  });

  it("completing the converted WO notifies the requester", async () => {
    const id = await createRequest(baseReq());
    await decideRequest(manager, id, "approved");
    const woId = await convertRequest(manager, id);
    await changeWorkOrderStatus(manager, woId, "completed");
    const notes = await db
      .select()
      .from(notifications)
      .where(eq(notifications.userId, requester.id));
    expect(notes.some((n) => n.type === "request.completed")).toBe(true);
  });

  it("validates site/location/asset consistency", async () => {
    const otherSite = await createSite(admin.id, { name: "Depot" });
    await expect(
      createRequest({ ...baseReq(), siteId: otherSite }),
    ).rejects.toThrow(/asset does not belong/i);
  });

  it("requester-scoped listing only shows own requests", async () => {
    await createRequest(baseReq());
    await createRequest({
      ...baseReq(),
      title: "Someone else's",
      requesterId: tech.id,
    });
    const own = await listRequests({ requesterId: requester.id });
    expect(own).toHaveLength(1);
    expect(own[0].request.title).toBe("Leaking pump");
  });
});

describe("corrective requests from failed inspections", () => {
  it("a failing createCorrective step files a high-priority corrective request once", async () => {
    const woId = await createWorkOrder(admin.id, {
      title: "Inspection round",
      siteId,
      workType: "inspection",
      priority: "medium",
      assigneeIds: [tech.id],
      assetIds: [assetId],
    });
    const tplId = await createTemplate(admin.id, {
      name: "Safety check",
      steps: [
        {
          type: "pass_fail",
          label: "Guard intact",
          required: true,
          failure: { requireComment: true, requirePhoto: false, createCorrective: true },
        },
      ],
    });
    const instId = await attachProcedure(admin.id, woId, tplId);

    await respondToStep(tech, instId, 0, { v: "fail", comment: "Guard bent" });
    // Re-answering the same failed step must NOT file a second request.
    await respondToStep(tech, instId, 0, { v: "fail", comment: "Still bent" });

    const requests = await db
      .select()
      .from(workRequests)
      .where(eq(workRequests.source, "inspection"));
    expect(requests).toHaveLength(1);
    expect(requests[0].priority).toBe("high");
    expect(requests[0].originWorkOrderId).toBe(woId);
    expect(requests[0].assetId).toBe(assetId);
    expect(requests[0].title).toContain("Guard intact");
  });
});

describe("notifications service", () => {
  it("unread counts and mark-all-read", async () => {
    const { listNotifications, markAllRead, unreadCount } = await import(
      "@/server/services/notifications"
    );
    await createRequest(baseReq()); // notifies manager + admin
    expect(await unreadCount(manager.id)).toBe(1);
    await markAllRead(manager.id);
    expect(await unreadCount(manager.id)).toBe(0);
    expect((await listNotifications(manager.id)).length).toBe(1);
  });
});

describe("guards", () => {
  it("cannot decide a converted request", async () => {
    const id = await createRequest(baseReq());
    await decideRequest(manager, id, "approved");
    await convertRequest(manager, id);
    await expect(
      decideRequest(manager, id, "declined", "changed my mind"),
    ).rejects.toThrow(ServiceError);
  });
});
