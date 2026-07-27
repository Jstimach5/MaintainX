import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/server/db";
import { sql } from "drizzle-orm";
import { createSite, updateSite, getSite } from "@/server/services/sites";
import {
  createLocation,
  getLocation,
  getLocationTree,
  listLocationOptions,
  updateLocation,
} from "@/server/services/locations";
import { ServiceError } from "@/server/services/users";
import { makeUser, truncateAll } from "./helpers";

async function truncateSitesToo() {
  await truncateAll();
  await db.execute(
    sql`TRUNCATE TABLE locations, sites RESTART IDENTITY CASCADE`,
  );
}

let actor: number;

beforeEach(async () => {
  await truncateSitesToo();
  actor = (await makeUser({ role: "admin" })).id;
});

describe("sites", () => {
  it("creates and reads a site", async () => {
    const id = await createSite(actor, { name: "Main Plant", code: "MAIN" });
    const site = await getSite(id);
    expect(site?.name).toBe("Main Plant");
    expect(site?.isActive).toBe(true);
  });

  it("rejects duplicate site names", async () => {
    await createSite(actor, { name: "Main Plant" });
    await expect(createSite(actor, { name: "Main Plant" })).rejects.toThrow(
      ServiceError,
    );
  });

  it("archiving a site archives all its locations", async () => {
    const siteId = await createSite(actor, { name: "Main" });
    const a = await createLocation(actor, { siteId, name: "Building A" });
    const b = await createLocation(actor, {
      siteId,
      parentId: a,
      name: "Room 1",
    });
    await updateSite(actor, siteId, { name: "Main", isActive: false });
    expect((await getLocation(a))?.isActive).toBe(false);
    expect((await getLocation(b))?.isActive).toBe(false);
  });
});

describe("locations", () => {
  it("builds a nested tree", async () => {
    const siteId = await createSite(actor, { name: "Main" });
    const building = await createLocation(actor, { siteId, name: "Building A" });
    await createLocation(actor, { siteId, parentId: building, name: "Room 1" });
    await createLocation(actor, { siteId, parentId: building, name: "Room 2" });
    await createLocation(actor, { siteId, name: "Yard" });

    const tree = await getLocationTree(siteId);
    expect(tree).toHaveLength(2);
    const b = tree.find((n) => n.name === "Building A");
    expect(b?.children.map((c) => c.name).sort()).toEqual(["Room 1", "Room 2"]);
  });

  it("rejects a parent from a different site", async () => {
    const s1 = await createSite(actor, { name: "S1" });
    const s2 = await createSite(actor, { name: "S2" });
    const other = await createLocation(actor, { siteId: s2, name: "Elsewhere" });
    await expect(
      createLocation(actor, { siteId: s1, parentId: other, name: "Bad" }),
    ).rejects.toThrow(/different site/i);
  });

  it("prevents re-parenting cycles", async () => {
    const siteId = await createSite(actor, { name: "Main" });
    const a = await createLocation(actor, { siteId, name: "A" });
    const b = await createLocation(actor, { siteId, parentId: a, name: "B" });
    const c = await createLocation(actor, { siteId, parentId: b, name: "C" });
    // Try to move A underneath C (its own grandchild) → cycle.
    await expect(
      updateLocation(actor, a, { name: "A", parentId: c, isActive: true }),
    ).rejects.toThrow(/underneath itself/i);
    // Also directly underneath itself.
    await expect(
      updateLocation(actor, a, { name: "A", parentId: a, isActive: true }),
    ).rejects.toThrow(/underneath itself/i);
  });

  it("archiving a location archives its whole subtree", async () => {
    const siteId = await createSite(actor, { name: "Main" });
    const a = await createLocation(actor, { siteId, name: "A" });
    const b = await createLocation(actor, { siteId, parentId: a, name: "B" });
    const c = await createLocation(actor, { siteId, parentId: b, name: "C" });
    const sibling = await createLocation(actor, { siteId, name: "Sibling" });

    await updateLocation(actor, a, { name: "A", parentId: null, isActive: false });

    expect((await getLocation(b))?.isActive).toBe(false);
    expect((await getLocation(c))?.isActive).toBe(false);
    expect((await getLocation(sibling))?.isActive).toBe(true);
  });

  it("refuses new children under an archived parent", async () => {
    const siteId = await createSite(actor, { name: "Main" });
    const a = await createLocation(actor, { siteId, name: "A" });
    await updateLocation(actor, a, { name: "A", parentId: null, isActive: false });
    await expect(
      createLocation(actor, { siteId, parentId: a, name: "Child" }),
    ).rejects.toThrow(/archived/i);
  });

  it("picker options exclude archived nodes and carry depth", async () => {
    const siteId = await createSite(actor, { name: "Main" });
    const a = await createLocation(actor, { siteId, name: "A" });
    await createLocation(actor, { siteId, parentId: a, name: "A1" });
    const dead = await createLocation(actor, { siteId, name: "Dead" });
    await updateLocation(actor, dead, { name: "Dead", parentId: null, isActive: false });

    const options = await listLocationOptions(siteId);
    expect(options.map((o) => o.label)).toEqual(["A", "A1"]);
    expect(options[1].depth).toBe(1);
  });
});
