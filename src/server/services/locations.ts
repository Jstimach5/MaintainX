import { asc, eq } from "drizzle-orm";
import { db } from "@/server/db";
import { locations, sites } from "@/server/db/schema";
import { recordAudit } from "./audit";
import { ServiceError } from "./users";

export type LocationRow = typeof locations.$inferSelect;

export type LocationNode = LocationRow & { children: LocationNode[] };

/** Assemble the location tree for a site (archived nodes included). */
export async function getLocationTree(siteId: number): Promise<LocationNode[]> {
  const rows = await db
    .select()
    .from(locations)
    .where(eq(locations.siteId, siteId))
    .orderBy(asc(locations.name));
  const byId = new Map<number, LocationNode>(
    rows.map((r) => [r.id, { ...r, children: [] }]),
  );
  const roots: LocationNode[] = [];
  for (const node of byId.values()) {
    if (node.parentId != null && byId.has(node.parentId)) {
      byId.get(node.parentId)!.children.push(node);
    } else {
      roots.push(node);
    }
  }
  return roots;
}

export async function getLocation(id: number) {
  const rows = await db
    .select()
    .from(locations)
    .where(eq(locations.id, id))
    .limit(1);
  return rows[0] ?? null;
}

/** Full ancestor path (site-scoped), root first — used for breadcrumbs. */
export async function getLocationPath(id: number): Promise<LocationRow[]> {
  const path: LocationRow[] = [];
  let current: LocationRow | null = await getLocation(id);
  const seen = new Set<number>();
  while (current) {
    if (seen.has(current.id)) break; // corrupt cycle guard
    seen.add(current.id);
    path.unshift(current);
    current = current.parentId ? await getLocation(current.parentId) : null;
  }
  return path;
}

async function assertValidParent(
  siteId: number,
  parentId: number | null,
  selfId?: number,
): Promise<void> {
  if (parentId == null) return;
  const parent = await getLocation(parentId);
  if (!parent) throw new ServiceError("Parent location not found.");
  if (parent.siteId !== siteId) {
    throw new ServiceError("Parent location belongs to a different site.");
  }
  if (!parent.isActive) {
    throw new ServiceError(
      "Parent location is archived — restore it first or pick another parent.",
    );
  }
  if (selfId != null) {
    // Walk up from the proposed parent; hitting self means a cycle.
    let cursor: typeof parent | null = parent;
    const seen = new Set<number>();
    while (cursor) {
      if (cursor.id === selfId) {
        throw new ServiceError(
          "Cannot move a location underneath itself or one of its children.",
        );
      }
      if (seen.has(cursor.id)) break;
      seen.add(cursor.id);
      cursor = cursor.parentId ? await getLocation(cursor.parentId) : null;
    }
  }
}

export async function createLocation(
  actorId: number,
  input: {
    siteId: number;
    parentId?: number | null;
    name: string;
    code?: string | null;
    description?: string | null;
  },
): Promise<number> {
  const site = await db
    .select()
    .from(sites)
    .where(eq(sites.id, input.siteId))
    .limit(1);
  if (site.length === 0) throw new ServiceError("Site not found.");
  if (!site[0].isActive) {
    throw new ServiceError("This site is archived — restore it first.");
  }
  await assertValidParent(input.siteId, input.parentId ?? null);
  return db.transaction(async (tx) => {
    const [row] = await tx
      .insert(locations)
      .values({
        siteId: input.siteId,
        parentId: input.parentId ?? null,
        name: input.name,
        code: input.code || null,
        description: input.description || null,
      })
      .returning({ id: locations.id });
    await recordAudit(tx, {
      userId: actorId,
      action: "location.create",
      entityType: "location",
      entityId: row.id,
      summary: `Created location "${input.name}" in site "${site[0].name}"`,
    });
    return row.id;
  });
}

export async function updateLocation(
  actorId: number,
  locationId: number,
  input: {
    name: string;
    code?: string | null;
    description?: string | null;
    parentId?: number | null;
    isActive: boolean;
  },
): Promise<void> {
  const existing = await getLocation(locationId);
  if (!existing) throw new ServiceError("Location not found.");
  await assertValidParent(existing.siteId, input.parentId ?? null, locationId);

  await db.transaction(async (tx) => {
    await tx
      .update(locations)
      .set({
        name: input.name,
        code: input.code || null,
        description: input.description || null,
        parentId: input.parentId ?? null,
        isActive: input.isActive,
      })
      .where(eq(locations.id, locationId));

    // Archiving cascades to descendants — a child of an archived location
    // must not remain selectable.
    if (existing.isActive && !input.isActive) {
      const all = await tx
        .select()
        .from(locations)
        .where(eq(locations.siteId, existing.siteId));
      const childrenOf = new Map<number, number[]>();
      for (const l of all) {
        if (l.parentId != null) {
          childrenOf.set(l.parentId, [
            ...(childrenOf.get(l.parentId) ?? []),
            l.id,
          ]);
        }
      }
      const toArchive: number[] = [];
      const stack = [...(childrenOf.get(locationId) ?? [])];
      while (stack.length > 0) {
        const id = stack.pop()!;
        toArchive.push(id);
        stack.push(...(childrenOf.get(id) ?? []));
      }
      for (const id of toArchive) {
        await tx
          .update(locations)
          .set({ isActive: false })
          .where(eq(locations.id, id));
      }
    }

    await recordAudit(tx, {
      userId: actorId,
      action: "location.update",
      entityType: "location",
      entityId: locationId,
      summary: `Updated location "${input.name}"`,
      previousValue: {
        name: existing.name,
        parentId: existing.parentId,
        isActive: existing.isActive,
      },
      newValue: {
        name: input.name,
        parentId: input.parentId ?? null,
        isActive: input.isActive,
      },
    });
  });
}

/** Flat list of a site's active locations with indent depth (for pickers). */
export async function listLocationOptions(
  siteId: number,
): Promise<{ id: number; label: string; depth: number }[]> {
  const tree = await getLocationTree(siteId);
  const out: { id: number; label: string; depth: number }[] = [];
  const walk = (nodes: LocationNode[], depth: number) => {
    for (const n of nodes) {
      if (!n.isActive) continue;
      out.push({ id: n.id, label: n.name, depth });
      walk(n.children, depth + 1);
    }
  };
  walk(tree, 0);
  return out;
}
