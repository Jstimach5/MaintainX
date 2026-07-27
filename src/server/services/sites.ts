import { asc, eq } from "drizzle-orm";
import { db } from "@/server/db";
import { locations, sites } from "@/server/db/schema";
import { recordAudit } from "./audit";
import { ServiceError } from "./users";

export async function listSites(opts?: { activeOnly?: boolean }) {
  const rows = await db.select().from(sites).orderBy(asc(sites.name));
  return opts?.activeOnly ? rows.filter((s) => s.isActive) : rows;
}

export async function getSite(id: number) {
  const rows = await db.select().from(sites).where(eq(sites.id, id)).limit(1);
  return rows[0] ?? null;
}

export async function createSite(
  actorId: number,
  input: {
    name: string;
    code?: string | null;
    address?: string | null;
    description?: string | null;
  },
): Promise<number> {
  return db.transaction(async (tx) => {
    const clash = await tx
      .select({ id: sites.id })
      .from(sites)
      .where(eq(sites.name, input.name))
      .limit(1);
    if (clash.length > 0) {
      throw new ServiceError(`A site named "${input.name}" already exists.`);
    }
    const [row] = await tx
      .insert(sites)
      .values({
        name: input.name,
        code: input.code || null,
        address: input.address || null,
        description: input.description || null,
      })
      .returning({ id: sites.id });
    await recordAudit(tx, {
      userId: actorId,
      action: "site.create",
      entityType: "site",
      entityId: row.id,
      summary: `Created site "${input.name}"`,
    });
    return row.id;
  });
}

/** Enable (mint token) or disable the public request portal (§8). */
export async function setPortalEnabled(
  actorId: number,
  siteId: number,
  enabled: boolean,
): Promise<void> {
  const site = await getSite(siteId);
  if (!site) throw new ServiceError("Site not found.");
  const crypto = await import("crypto");
  const token = enabled ? crypto.randomBytes(24).toString("base64url") : null;
  await db.transaction(async (tx) => {
    await tx.update(sites).set({ portalToken: token }).where(eq(sites.id, siteId));
    await recordAudit(tx, {
      userId: actorId,
      action: enabled ? "site.portal_enabled" : "site.portal_disabled",
      entityType: "site",
      entityId: siteId,
      summary: `${enabled ? "Enabled" : "Disabled"} public request portal for "${site.name}"`,
    });
  });
}

export async function updateSite(
  actorId: number,
  siteId: number,
  input: {
    name: string;
    code?: string | null;
    address?: string | null;
    description?: string | null;
    isActive: boolean;
  },
): Promise<void> {
  await db.transaction(async (tx) => {
    const existing = await tx
      .select()
      .from(sites)
      .where(eq(sites.id, siteId))
      .limit(1);
    if (existing.length === 0) throw new ServiceError("Site not found.");
    await tx
      .update(sites)
      .set({
        name: input.name,
        code: input.code || null,
        address: input.address || null,
        description: input.description || null,
        isActive: input.isActive,
      })
      .where(eq(sites.id, siteId));
    // Archiving a site archives its locations too — an inactive site must
    // not leave its locations selectable in pickers.
    if (existing[0].isActive && !input.isActive) {
      await tx
        .update(locations)
        .set({ isActive: false })
        .where(eq(locations.siteId, siteId));
    }
    await recordAudit(tx, {
      userId: actorId,
      action: "site.update",
      entityType: "site",
      entityId: siteId,
      summary: `Updated site "${input.name}"${existing[0].isActive && !input.isActive ? " (archived, incl. locations)" : ""}`,
      previousValue: {
        name: existing[0].name,
        isActive: existing[0].isActive,
      },
      newValue: { name: input.name, isActive: input.isActive },
    });
  });
}
