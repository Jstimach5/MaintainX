import { and, desc, eq, sql } from "drizzle-orm";
import { db } from "@/server/db";
import {
  assets,
  locations,
  sites,
  users,
  workOrders,
  workRequests,
} from "@/server/db/schema";
import type { SessionUser } from "@/server/auth/session";
import { recordAudit } from "./audit";
import { ServiceError } from "./users";
import { managerAudience, notifyUsers } from "./notifications";
import { createWorkOrder } from "./workOrders";

export type RequestRow = typeof workRequests.$inferSelect;
export type RequestStatusValue = RequestRow["status"];

export const REQUEST_STATUSES: {
  value: RequestStatusValue;
  label: string;
  tone: "gray" | "blue" | "amber" | "green" | "red" | "purple";
}[] = [
  { value: "submitted", label: "Submitted", tone: "blue" },
  { value: "under_review", label: "Under review", tone: "amber" },
  { value: "approved", label: "Approved", tone: "green" },
  { value: "declined", label: "Declined", tone: "red" },
  { value: "converted", label: "Converted to work order", tone: "purple" },
  { value: "canceled", label: "Canceled", tone: "gray" },
];

export function requestStatusLabel(v: RequestStatusValue): string {
  return REQUEST_STATUSES.find((s) => s.value === v)?.label ?? v;
}

async function nextRequestNumber(tx: Pick<typeof db, "select">): Promise<string> {
  const rows = await tx
    .select({
      n: sql<string>`max(substring(${workRequests.requestNumber} from '^REQ-(\\d+)$'))`,
    })
    .from(workRequests);
  const max = rows[0]?.n ? parseInt(rows[0].n, 10) : 0;
  return `REQ-${String(max + 1).padStart(4, "0")}`;
}

export async function getRequest(id: number): Promise<RequestRow | null> {
  const rows = await db
    .select()
    .from(workRequests)
    .where(eq(workRequests.id, id))
    .limit(1);
  return rows[0] ?? null;
}

export type RequestInput = {
  title: string;
  description?: string | null;
  siteId: number;
  locationId?: number | null;
  assetId?: number | null;
  priority: RequestRow["priority"];
  category?: string | null;
  requestedCompletionDate?: string | null;
  requesterId?: number | null;
  requesterName?: string | null;
  requesterContact?: string | null;
  source?: RequestRow["source"];
  originWorkOrderId?: number | null;
};

export async function createRequest(input: RequestInput): Promise<number> {
  const site = await db
    .select()
    .from(sites)
    .where(eq(sites.id, input.siteId))
    .limit(1);
  if (site.length === 0 || !site[0].isActive) {
    throw new ServiceError("Site not found.");
  }
  if (input.locationId != null) {
    const loc = await db
      .select()
      .from(locations)
      .where(eq(locations.id, input.locationId))
      .limit(1);
    if (loc.length === 0 || loc[0].siteId !== input.siteId) {
      throw new ServiceError("Location does not belong to that site.");
    }
  }
  if (input.assetId != null) {
    const asset = await db
      .select()
      .from(assets)
      .where(eq(assets.id, input.assetId))
      .limit(1);
    if (asset.length === 0 || asset[0].siteId !== input.siteId) {
      throw new ServiceError("Asset does not belong to that site.");
    }
  }

  const id = await db.transaction(async (tx) => {
    const requestNumber = await nextRequestNumber(tx);
    const [row] = await tx
      .insert(workRequests)
      .values({
        requestNumber,
        title: input.title,
        description: input.description || null,
        requesterId: input.requesterId ?? null,
        requesterName: input.requesterName || null,
        requesterContact: input.requesterContact || null,
        siteId: input.siteId,
        locationId: input.locationId ?? null,
        assetId: input.assetId ?? null,
        priority: input.priority,
        category: input.category || null,
        requestedCompletionDate: input.requestedCompletionDate || null,
        source: input.source ?? "internal",
        originWorkOrderId: input.originWorkOrderId ?? null,
      })
      .returning({ id: workRequests.id });
    await recordAudit(tx, {
      userId: input.requesterId ?? null,
      action: "request.create",
      entityType: "request",
      entityId: row.id,
      summary: `Submitted ${requestNumber} "${input.title}"`,
      source: input.source === "portal" ? "portal" : "web",
    });
    return row.id;
  });

  const audience = await managerAudience();
  await notifyUsers(audience, {
    type: "request.submitted",
    title: `New request: ${input.title}`,
    body: input.requesterName ?? undefined,
    link: `/requests/${id}`,
  });
  return id;
}

/** Corrective request spawned by a failed inspection step (§7). */
export async function createCorrectiveRequest(
  actor: SessionUser,
  workOrderId: number,
  stepLabel: string,
  comment: string | undefined,
): Promise<number> {
  const [wo] = await db
    .select()
    .from(workOrders)
    .where(eq(workOrders.id, workOrderId))
    .limit(1);
  if (!wo) throw new ServiceError("Work order not found.");
  const primaryAsset = await db.execute(
    sql`SELECT asset_id FROM work_order_assets WHERE work_order_id = ${workOrderId} AND is_primary LIMIT 1`,
  );
  const assetId =
    (primaryAsset.rows[0]?.asset_id as number | undefined) ?? null;
  return createRequest({
    title: `Corrective: ${stepLabel} (${wo.woNumber})`,
    description: `Failed inspection step "${stepLabel}" on ${wo.woNumber}${comment ? `:\n${comment}` : "."}`,
    siteId: wo.siteId,
    locationId: wo.locationId,
    assetId,
    priority: "high",
    requesterId: actor.id,
    requesterName: actor.displayName,
    source: "inspection",
    originWorkOrderId: workOrderId,
  });
}

export async function setUnderReview(
  actor: SessionUser,
  requestId: number,
): Promise<void> {
  const req = await getRequest(requestId);
  if (!req) throw new ServiceError("Request not found.");
  if (req.status !== "submitted") return;
  await db.transaction(async (tx) => {
    await tx
      .update(workRequests)
      .set({ status: "under_review", updatedAt: new Date() })
      .where(eq(workRequests.id, requestId));
    await recordAudit(tx, {
      userId: actor.id,
      action: "request.under_review",
      entityType: "request",
      entityId: requestId,
      summary: `${req.requestNumber} under review`,
    });
  });
}

export async function decideRequest(
  actor: SessionUser,
  requestId: number,
  decision: "approved" | "declined",
  reason?: string | null,
): Promise<void> {
  const req = await getRequest(requestId);
  if (!req) throw new ServiceError("Request not found.");
  if (req.status === "converted") {
    throw new ServiceError("Already converted to a work order.");
  }
  if (decision === "declined" && !reason?.trim()) {
    throw new ServiceError("A decline reason is required.");
  }
  await db.transaction(async (tx) => {
    await tx
      .update(workRequests)
      .set({
        status: decision,
        declineReason: decision === "declined" ? reason : null,
        decidedBy: actor.id,
        decidedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(workRequests.id, requestId));
    await recordAudit(tx, {
      userId: actor.id,
      action: `request.${decision}`,
      entityType: "request",
      entityId: requestId,
      summary: `${req.requestNumber} ${decision}${reason ? `: ${reason}` : ""}`,
    });
  });
  if (req.requesterId) {
    await notifyUsers([req.requesterId], {
      type: `request.${decision}`,
      title: `Your request "${req.title}" was ${decision}`,
      body: decision === "declined" ? reason : undefined,
      link: `/requests/${requestId}`,
    });
  }
}

/**
 * Convert an approved request into exactly one work order (§8). The claim is
 * a conditional UPDATE (`status = 'approved'` → `converted`) — if a
 * concurrent convert wins, the UPDATE matches zero rows and this attempt's
 * freshly-created WO is canceled. The partial unique index on
 * converted_work_order_id is the DB-level backstop.
 */
export async function convertRequest(
  actor: SessionUser,
  requestId: number,
): Promise<number> {
  const req = await getRequest(requestId);
  if (!req) throw new ServiceError("Request not found.");
  if (req.status === "converted") {
    throw new ServiceError("Already converted to a work order.");
  }
  if (req.status !== "approved") {
    throw new ServiceError("Approve the request before converting it.");
  }

  const newWoId = await createWorkOrder(actor.id, {
    title: req.title,
    description: req.description,
    siteId: req.siteId,
    locationId: req.locationId,
    assetIds: req.assetId ? [req.assetId] : [],
    workType: "reactive",
    priority: req.priority,
    requesterId: req.requesterId,
    source: "request",
  });

  const claimed = await db
    .update(workRequests)
    .set({
      status: "converted",
      convertedWorkOrderId: newWoId,
      decidedBy: actor.id,
      updatedAt: new Date(),
    })
    .where(
      and(eq(workRequests.id, requestId), eq(workRequests.status, "approved")),
    )
    .returning({ id: workRequests.id });

  if (claimed.length === 0) {
    // Lost a race — retire the WO this attempt created.
    const { changeWorkOrderStatus } = await import("./workOrders");
    await changeWorkOrderStatus(actor, newWoId, "canceled", {
      note: "Duplicate conversion attempt — request was already converted.",
    });
    throw new ServiceError("Already converted to a work order.");
  }

  await recordAudit(db, {
    userId: actor.id,
    action: "request.converted",
    entityType: "request",
    entityId: requestId,
    summary: `${req.requestNumber} converted to work order #${newWoId}`,
  });
  if (req.requesterId) {
    await notifyUsers([req.requesterId], {
      type: "request.converted",
      title: `Your request "${req.title}" became a work order`,
      link: `/requests/${requestId}`,
    });
  }
  return newWoId;
}

/** Called from WO completion so requesters learn their issue is fixed (§8). */
export async function notifyRequestClosedForWo(
  workOrderId: number,
): Promise<void> {
  const rows = await db
    .select()
    .from(workRequests)
    .where(eq(workRequests.convertedWorkOrderId, workOrderId))
    .limit(1);
  const req = rows[0];
  if (req?.requesterId) {
    await notifyUsers([req.requesterId], {
      type: "request.completed",
      title: `Work on your request "${req.title}" is complete`,
      link: `/requests/${req.id}`,
    });
  }
}

export type RequestListFilters = {
  status?: RequestStatusValue;
  siteId?: number;
  requesterId?: number; // restrict to own requests (requester role)
};

export async function listRequests(filters: RequestListFilters = {}) {
  const conds = [];
  if (filters.status) conds.push(eq(workRequests.status, filters.status));
  if (filters.siteId) conds.push(eq(workRequests.siteId, filters.siteId));
  if (filters.requesterId) {
    conds.push(eq(workRequests.requesterId, filters.requesterId));
  }
  return db
    .select({
      request: workRequests,
      siteName: sites.name,
      locationName: locations.name,
      assetName: assets.name,
      requesterDisplay: users.displayName,
    })
    .from(workRequests)
    .innerJoin(sites, eq(workRequests.siteId, sites.id))
    .leftJoin(locations, eq(workRequests.locationId, locations.id))
    .leftJoin(assets, eq(workRequests.assetId, assets.id))
    .leftJoin(users, eq(workRequests.requesterId, users.id))
    .where(conds.length > 0 ? and(...conds) : undefined)
    .orderBy(desc(workRequests.createdAt))
    .limit(500);
}

export async function getRequestDetail(requestId: number) {
  const rows = await listRequests({});
  const found = rows.find((r) => r.request.id === requestId);
  if (!found) return null;
  const convertedWo = found.request.convertedWorkOrderId
    ? (
        await db
          .select()
          .from(workOrders)
          .where(eq(workOrders.id, found.request.convertedWorkOrderId))
          .limit(1)
      )[0]
    : null;
  const originWo = found.request.originWorkOrderId
    ? (
        await db
          .select()
          .from(workOrders)
          .where(eq(workOrders.id, found.request.originWorkOrderId))
          .limit(1)
      )[0]
    : null;
  return { ...found, convertedWo, originWo };
}
