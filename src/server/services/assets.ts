import crypto from "crypto";
import { and, asc, desc, eq, ilike, isNull, or, sql } from "drizzle-orm";
import { db } from "@/server/db";
import {
  assetLocationHistory,
  assetStatusHistory,
  assets,
  locations,
  sites,
  teams,
  users,
} from "@/server/db/schema";
import { getLocation } from "./locations";
import { recordAudit } from "./audit";
import { ServiceError } from "./users";

export type AssetRow = typeof assets.$inferSelect;
export type AssetStatusValue = AssetRow["status"];

export const ASSET_STATUSES: {
  value: AssetStatusValue;
  label: string;
  tone: "green" | "red" | "amber" | "gray" | "blue" | "purple";
}[] = [
  { value: "online", label: "Online", tone: "green" },
  { value: "offline", label: "Offline", tone: "red" },
  { value: "limited", label: "Limited operation", tone: "amber" },
  { value: "planned_downtime", label: "Planned downtime", tone: "blue" },
  { value: "unplanned_downtime", label: "Unplanned downtime", tone: "red" },
  { value: "out_for_repair", label: "Out for repair", tone: "purple" },
  { value: "retired", label: "Retired", tone: "gray" },
  { value: "not_tracked", label: "Status not tracked", tone: "gray" },
];

export function assetStatusLabel(value: AssetStatusValue): string {
  return ASSET_STATUSES.find((s) => s.value === value)?.label ?? value;
}

async function nextAssetNumber(): Promise<string> {
  // A-0001 style, derived from the current max numeric suffix.
  const rows = await db
    .select({ n: sql<string>`max(substring(${assets.assetNumber} from '^A-(\\d+)$'))` })
    .from(assets);
  const max = rows[0]?.n ? parseInt(rows[0].n, 10) : 0;
  return `A-${String(max + 1).padStart(4, "0")}`;
}

async function assertLocationInSite(
  siteId: number,
  locationId: number | null,
): Promise<void> {
  if (locationId == null) return;
  const loc = await getLocation(locationId);
  if (!loc) throw new ServiceError("Location not found.");
  if (loc.siteId !== siteId) {
    throw new ServiceError("That location belongs to a different site.");
  }
  if (!loc.isActive) {
    throw new ServiceError("That location is archived — pick another.");
  }
}

async function assertValidParentAsset(
  parentAssetId: number | null,
  selfId?: number,
): Promise<void> {
  if (parentAssetId == null) return;
  let cursor = await getAsset(parentAssetId);
  if (!cursor) throw new ServiceError("Parent asset not found.");
  if (cursor.archivedAt) {
    throw new ServiceError("Parent asset is archived — pick another.");
  }
  if (selfId != null) {
    const seen = new Set<number>();
    while (cursor) {
      if (cursor.id === selfId) {
        throw new ServiceError(
          "Cannot nest an asset underneath itself or one of its sub-assets.",
        );
      }
      if (seen.has(cursor.id)) break;
      seen.add(cursor.id);
      cursor = cursor.parentAssetId ? await getAsset(cursor.parentAssetId) : null;
    }
  }
}

export async function getAsset(id: number): Promise<AssetRow | null> {
  const rows = await db.select().from(assets).where(eq(assets.id, id)).limit(1);
  return rows[0] ?? null;
}

export async function getAssetByQrToken(token: string): Promise<AssetRow | null> {
  const rows = await db
    .select()
    .from(assets)
    .where(eq(assets.qrToken, token))
    .limit(1);
  return rows[0] ?? null;
}

export type AssetListFilters = {
  q?: string;
  siteId?: number;
  status?: AssetStatusValue;
  includeArchived?: boolean;
};

export async function listAssets(filters: AssetListFilters = {}) {
  const conds = [];
  if (filters.q) {
    const like = `%${filters.q}%`;
    conds.push(
      or(
        ilike(assets.name, like),
        ilike(assets.assetNumber, like),
        ilike(assets.serialNumber, like),
        ilike(assets.model, like),
      ),
    );
  }
  if (filters.siteId) conds.push(eq(assets.siteId, filters.siteId));
  if (filters.status) conds.push(eq(assets.status, filters.status));
  if (!filters.includeArchived) conds.push(isNull(assets.archivedAt));

  return db
    .select({
      asset: assets,
      siteName: sites.name,
      locationName: locations.name,
    })
    .from(assets)
    .innerJoin(sites, eq(assets.siteId, sites.id))
    .leftJoin(locations, eq(assets.locationId, locations.id))
    .where(conds.length > 0 ? and(...conds) : undefined)
    .orderBy(asc(assets.name))
    .limit(500);
}

export type AssetInput = {
  assetNumber?: string | null;
  name: string;
  description?: string | null;
  assetType?: string | null;
  siteId: number;
  locationId?: number | null;
  parentAssetId?: number | null;
  make?: string | null;
  model?: string | null;
  serialNumber?: string | null;
  year?: number | null;
  purchaseDate?: string | null;
  inServiceDate?: string | null;
  warrantyInfo?: string | null;
  criticality: "low" | "medium" | "high" | "critical";
  responsibleTeamId?: number | null;
  responsibleUserId?: number | null;
  notes?: string | null;
  tags?: string[];
};

export async function createAsset(
  actorId: number,
  input: AssetInput,
): Promise<number> {
  const site = await db
    .select()
    .from(sites)
    .where(eq(sites.id, input.siteId))
    .limit(1);
  if (site.length === 0) throw new ServiceError("Site not found.");
  if (!site[0].isActive) throw new ServiceError("That site is archived.");
  await assertLocationInSite(input.siteId, input.locationId ?? null);
  await assertValidParentAsset(input.parentAssetId ?? null);

  const assetNumber = input.assetNumber?.trim() || (await nextAssetNumber());
  const clash = await db
    .select({ id: assets.id })
    .from(assets)
    .where(eq(assets.assetNumber, assetNumber))
    .limit(1);
  if (clash.length > 0) {
    throw new ServiceError(`Asset number "${assetNumber}" is already in use.`);
  }

  return db.transaction(async (tx) => {
    const [row] = await tx
      .insert(assets)
      .values({
        assetNumber,
        name: input.name,
        description: input.description || null,
        assetType: input.assetType || null,
        siteId: input.siteId,
        locationId: input.locationId ?? null,
        parentAssetId: input.parentAssetId ?? null,
        make: input.make || null,
        model: input.model || null,
        serialNumber: input.serialNumber || null,
        year: input.year ?? null,
        purchaseDate: input.purchaseDate || null,
        inServiceDate: input.inServiceDate || null,
        warrantyInfo: input.warrantyInfo || null,
        criticality: input.criticality,
        responsibleTeamId: input.responsibleTeamId ?? null,
        responsibleUserId: input.responsibleUserId ?? null,
        notes: input.notes || null,
        tags: input.tags && input.tags.length > 0 ? input.tags : null,
        qrToken: crypto.randomUUID(),
      })
      .returning({ id: assets.id });
    // Initial location history entry so the trail starts at creation.
    await tx.insert(assetLocationHistory).values({
      assetId: row.id,
      siteId: input.siteId,
      locationId: input.locationId ?? null,
      movedBy: actorId,
      note: "Initial placement",
    });
    await recordAudit(tx, {
      userId: actorId,
      action: "asset.create",
      entityType: "asset",
      entityId: row.id,
      summary: `Created asset ${assetNumber} "${input.name}"`,
    });
    return row.id;
  });
}

export async function updateAsset(
  actorId: number,
  assetId: number,
  input: Omit<AssetInput, "siteId" | "locationId"> ,
): Promise<void> {
  const existing = await getAsset(assetId);
  if (!existing) throw new ServiceError("Asset not found.");
  if (existing.archivedAt) {
    throw new ServiceError("This asset is archived — restore it first.");
  }
  await assertValidParentAsset(input.parentAssetId ?? null, assetId);

  const assetNumber = input.assetNumber?.trim() || existing.assetNumber;
  if (assetNumber !== existing.assetNumber) {
    const clash = await db
      .select({ id: assets.id })
      .from(assets)
      .where(eq(assets.assetNumber, assetNumber))
      .limit(1);
    if (clash.length > 0) {
      throw new ServiceError(`Asset number "${assetNumber}" is already in use.`);
    }
  }

  await db.transaction(async (tx) => {
    await tx
      .update(assets)
      .set({
        assetNumber,
        name: input.name,
        description: input.description || null,
        assetType: input.assetType || null,
        parentAssetId: input.parentAssetId ?? null,
        make: input.make || null,
        model: input.model || null,
        serialNumber: input.serialNumber || null,
        year: input.year ?? null,
        purchaseDate: input.purchaseDate || null,
        inServiceDate: input.inServiceDate || null,
        warrantyInfo: input.warrantyInfo || null,
        criticality: input.criticality,
        responsibleTeamId: input.responsibleTeamId ?? null,
        responsibleUserId: input.responsibleUserId ?? null,
        notes: input.notes || null,
        tags: input.tags && input.tags.length > 0 ? input.tags : null,
        updatedAt: new Date(),
      })
      .where(eq(assets.id, assetId));
    await recordAudit(tx, {
      userId: actorId,
      action: "asset.update",
      entityType: "asset",
      entityId: assetId,
      summary: `Updated asset ${assetNumber} "${input.name}"`,
    });
  });
}

/** Status change writes history + audit (§6). Allowed for field roles. */
export async function changeAssetStatus(
  actorId: number,
  assetId: number,
  status: AssetStatusValue,
  note?: string | null,
): Promise<void> {
  const existing = await getAsset(assetId);
  if (!existing) throw new ServiceError("Asset not found.");
  if (existing.archivedAt) {
    throw new ServiceError("This asset is archived.");
  }
  if (existing.status === status) return;
  await db.transaction(async (tx) => {
    await tx
      .update(assets)
      .set({ status, updatedAt: new Date() })
      .where(eq(assets.id, assetId));
    await tx.insert(assetStatusHistory).values({
      assetId,
      status,
      previousStatus: existing.status,
      note: note || null,
      changedBy: actorId,
    });
    await recordAudit(tx, {
      userId: actorId,
      action: "asset.status_change",
      entityType: "asset",
      entityId: assetId,
      summary: `Status: ${assetStatusLabel(existing.status)} → ${assetStatusLabel(status)}`,
      previousValue: { status: existing.status },
      newValue: { status },
    });
  });
}

/** Transfer to a new site/location; writes location history + audit (§5). */
export async function transferAsset(
  actorId: number,
  assetId: number,
  target: { siteId: number; locationId: number | null; note?: string | null },
): Promise<void> {
  const existing = await getAsset(assetId);
  if (!existing) throw new ServiceError("Asset not found.");
  if (existing.archivedAt) throw new ServiceError("This asset is archived.");
  const site = await db
    .select()
    .from(sites)
    .where(eq(sites.id, target.siteId))
    .limit(1);
  if (site.length === 0) throw new ServiceError("Site not found.");
  if (!site[0].isActive) throw new ServiceError("That site is archived.");
  await assertLocationInSite(target.siteId, target.locationId);

  if (
    existing.siteId === target.siteId &&
    existing.locationId === target.locationId
  ) {
    return; // no-op transfer; do not pollute history
  }

  await db.transaction(async (tx) => {
    await tx
      .update(assets)
      .set({
        siteId: target.siteId,
        locationId: target.locationId,
        updatedAt: new Date(),
      })
      .where(eq(assets.id, assetId));
    await tx.insert(assetLocationHistory).values({
      assetId,
      siteId: target.siteId,
      locationId: target.locationId,
      movedBy: actorId,
      note: target.note || null,
    });
    await recordAudit(tx, {
      userId: actorId,
      action: "asset.transfer",
      entityType: "asset",
      entityId: assetId,
      summary: `Transferred asset ${existing.assetNumber}`,
      previousValue: {
        siteId: existing.siteId,
        locationId: existing.locationId,
      },
      newValue: { siteId: target.siteId, locationId: target.locationId },
    });
  });
}

export async function setAssetArchived(
  actorId: number,
  assetId: number,
  archived: boolean,
): Promise<void> {
  const existing = await getAsset(assetId);
  if (!existing) throw new ServiceError("Asset not found.");
  await db.transaction(async (tx) => {
    await tx
      .update(assets)
      .set({ archivedAt: archived ? new Date() : null, updatedAt: new Date() })
      .where(eq(assets.id, assetId));
    await recordAudit(tx, {
      userId: actorId,
      action: archived ? "asset.archive" : "asset.restore",
      entityType: "asset",
      entityId: assetId,
      summary: `${archived ? "Archived" : "Restored"} asset ${existing.assetNumber}`,
    });
  });
}

export async function setMainPicture(
  actorId: number,
  assetId: number,
  attachmentId: number,
): Promise<void> {
  await db.transaction(async (tx) => {
    await tx
      .update(assets)
      .set({ mainAttachmentId: attachmentId, updatedAt: new Date() })
      .where(eq(assets.id, assetId));
    await recordAudit(tx, {
      userId: actorId,
      action: "asset.main_picture",
      entityType: "asset",
      entityId: assetId,
      summary: "Set main picture",
    });
  });
}

/** Everything the asset detail page needs, in one call. */
export async function getAssetDetail(assetId: number) {
  const asset = await getAsset(assetId);
  if (!asset) return null;
  const [site] = await db
    .select()
    .from(sites)
    .where(eq(sites.id, asset.siteId))
    .limit(1);
  const location = asset.locationId ? await getLocation(asset.locationId) : null;
  const parent = asset.parentAssetId ? await getAsset(asset.parentAssetId) : null;
  const children = await db
    .select()
    .from(assets)
    .where(eq(assets.parentAssetId, assetId))
    .orderBy(asc(assets.name));
  const statusHistory = await db
    .select({
      entry: assetStatusHistory,
      changedByName: users.displayName,
    })
    .from(assetStatusHistory)
    .innerJoin(users, eq(assetStatusHistory.changedBy, users.id))
    .where(eq(assetStatusHistory.assetId, assetId))
    .orderBy(desc(assetStatusHistory.createdAt))
    .limit(50);
  const locationHistory = await db
    .select({
      entry: assetLocationHistory,
      movedByName: users.displayName,
      siteName: sites.name,
      locationName: locations.name,
    })
    .from(assetLocationHistory)
    .innerJoin(users, eq(assetLocationHistory.movedBy, users.id))
    .innerJoin(sites, eq(assetLocationHistory.siteId, sites.id))
    .leftJoin(locations, eq(assetLocationHistory.locationId, locations.id))
    .where(eq(assetLocationHistory.assetId, assetId))
    .orderBy(desc(assetLocationHistory.createdAt))
    .limit(50);
  const responsibleTeam = asset.responsibleTeamId
    ? (
        await db
          .select()
          .from(teams)
          .where(eq(teams.id, asset.responsibleTeamId))
          .limit(1)
      )[0]
    : null;
  const responsibleUser = asset.responsibleUserId
    ? (
        await db
          .select({ id: users.id, displayName: users.displayName })
          .from(users)
          .where(eq(users.id, asset.responsibleUserId))
          .limit(1)
      )[0]
    : null;
  return {
    asset,
    site: site ?? null,
    location,
    parent,
    children,
    statusHistory,
    locationHistory,
    responsibleTeam,
    responsibleUser,
  };
}
