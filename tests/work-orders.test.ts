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
  canActOnWorkOrder,
  changeWorkOrderStatus,
  createWorkOrder,
  getWorkOrder,
  getWorkOrderDetail,
  listWorkOrders,
  updateWorkOrder,
} from "@/server/services/workOrders";
import { ServiceError } from "@/server/services/users";
import { makeUser, truncateAll } from "./helpers";
import type { SessionUser } from "@/server/auth/session";

async function reset() {
  await truncateAll();
  await db.execute(sql`
    TRUNCATE TABLE comments, work_order_labor, work_order_status_history,
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
