import { beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { sql } from "drizzle-orm";
import { db } from "@/server/db";
import { assetLocationHistory, assetStatusHistory, auditEvents } from "@/server/db/schema";
import { createSite } from "@/server/services/sites";
import { createLocation, updateLocation } from "@/server/services/locations";
import {
  changeAssetStatus,
  createAsset,
  getAsset,
  listAssets,
  setAssetArchived,
  transferAsset,
  updateAsset,
} from "@/server/services/assets";
import { ServiceError } from "@/server/services/users";
import { makeUser, truncateAll } from "./helpers";

async function reset() {
  await truncateAll();
  await db.execute(sql`
    TRUNCATE TABLE asset_location_history, asset_status_history, attachments,
      assets, locations, sites RESTART IDENTITY CASCADE
  `);
}

let actor: number;
let siteId: number;
let locationId: number;

const base = () => ({
  name: "Compressor 1",
  siteId,
  locationId,
  criticality: "medium" as const,
});

beforeEach(async () => {
  await reset();
  actor = (await makeUser({ role: "admin" })).id;
  siteId = await createSite(actor, { name: "Main" });
  locationId = await createLocation(actor, { siteId, name: "Shop Floor" });
});

describe("asset creation", () => {
  it("auto-assigns sequential asset numbers", async () => {
    const a = await createAsset(actor, base());
    const b = await createAsset(actor, { ...base(), name: "Compressor 2" });
    expect((await getAsset(a))?.assetNumber).toBe("A-0001");
    expect((await getAsset(b))?.assetNumber).toBe("A-0002");
  });

  it("accepts a manual asset number and rejects duplicates", async () => {
    await createAsset(actor, { ...base(), assetNumber: "PUMP-7" });
    await expect(
      createAsset(actor, { ...base(), assetNumber: "PUMP-7" }),
    ).rejects.toThrow(/already in use/i);
  });

  it("writes an initial location history entry", async () => {
    const id = await createAsset(actor, base());
    const hist = await db
      .select()
      .from(assetLocationHistory)
      .where(eq(assetLocationHistory.assetId, id));
    expect(hist).toHaveLength(1);
    expect(hist[0].locationId).toBe(locationId);
  });

  it("rejects a location from another site", async () => {
    const otherSite = await createSite(actor, { name: "Other" });
    const otherLoc = await createLocation(actor, {
      siteId: otherSite,
      name: "Elsewhere",
    });
    await expect(
      createAsset(actor, { ...base(), locationId: otherLoc }),
    ).rejects.toThrow(/different site/i);
  });

  it("rejects an archived location", async () => {
    await updateLocation(actor, locationId, {
      name: "Shop Floor",
      parentId: null,
      isActive: false,
    });
    await expect(createAsset(actor, base())).rejects.toThrow(/archived/i);
  });

  it("generates a unique qr token", async () => {
    const a = await createAsset(actor, base());
    const b = await createAsset(actor, { ...base(), name: "B" });
    const [ra, rb] = [await getAsset(a), await getAsset(b)];
    expect(ra?.qrToken).toMatch(/^[a-f0-9-]{36}$/);
    expect(ra?.qrToken).not.toBe(rb?.qrToken);
  });
});

describe("sub-asset hierarchy", () => {
  it("prevents nesting cycles", async () => {
    const a = await createAsset(actor, { ...base(), name: "Machine" });
    const b = await createAsset(actor, {
      ...base(),
      name: "Motor",
      parentAssetId: a,
    });
    await expect(
      updateAsset(actor, a, {
        name: "Machine",
        criticality: "medium",
        parentAssetId: b,
      }),
    ).rejects.toThrow(/underneath itself/i);
  });
});

describe("status changes", () => {
  it("writes status history + audit and updates the asset", async () => {
    const id = await createAsset(actor, base());
    await changeAssetStatus(actor, id, "offline", "belt snapped");
    expect((await getAsset(id))?.status).toBe("offline");
    const hist = await db
      .select()
      .from(assetStatusHistory)
      .where(eq(assetStatusHistory.assetId, id));
    expect(hist).toHaveLength(1);
    expect(hist[0].previousStatus).toBe("online");
    expect(hist[0].note).toBe("belt snapped");
    const audit = await db
      .select()
      .from(auditEvents)
      .where(eq(auditEvents.action, "asset.status_change"));
    expect(audit.length).toBe(1);
  });

  it("no-ops on same-status change (no history spam)", async () => {
    const id = await createAsset(actor, base());
    await changeAssetStatus(actor, id, "online");
    const hist = await db
      .select()
      .from(assetStatusHistory)
      .where(eq(assetStatusHistory.assetId, id));
    expect(hist).toHaveLength(0);
  });

  it("refuses status changes on archived assets", async () => {
    const id = await createAsset(actor, base());
    await setAssetArchived(actor, id, true);
    await expect(changeAssetStatus(actor, id, "offline")).rejects.toThrow(
      ServiceError,
    );
  });
});

describe("transfers", () => {
  it("moves the asset and appends location history", async () => {
    const id = await createAsset(actor, base());
    const site2 = await createSite(actor, { name: "Depot" });
    const yard = await createLocation(actor, { siteId: site2, name: "Yard" });
    await transferAsset(actor, id, {
      siteId: site2,
      locationId: yard,
      note: "seasonal move",
    });
    const asset = await getAsset(id);
    expect(asset?.siteId).toBe(site2);
    expect(asset?.locationId).toBe(yard);
    const hist = await db
      .select()
      .from(assetLocationHistory)
      .where(eq(assetLocationHistory.assetId, id));
    expect(hist).toHaveLength(2); // initial + transfer
  });

  it("no-ops when target equals current placement", async () => {
    const id = await createAsset(actor, base());
    await transferAsset(actor, id, { siteId, locationId });
    const hist = await db
      .select()
      .from(assetLocationHistory)
      .where(eq(assetLocationHistory.assetId, id));
    expect(hist).toHaveLength(1);
  });

  it("rejects a cross-site location target", async () => {
    const id = await createAsset(actor, base());
    const site2 = await createSite(actor, { name: "Depot" });
    await expect(
      transferAsset(actor, id, { siteId: site2, locationId }),
    ).rejects.toThrow(/different site/i);
  });
});

describe("listing", () => {
  it("filters by search, site, status, and archived flag", async () => {
    const a = await createAsset(actor, { ...base(), name: "Forklift" });
    await createAsset(actor, { ...base(), name: "Compressor" });
    await changeAssetStatus(actor, a, "out_for_repair");

    expect((await listAssets({ q: "fork" })).map((r) => r.asset.name)).toEqual([
      "Forklift",
    ]);
    expect(
      (await listAssets({ status: "out_for_repair" })).map((r) => r.asset.name),
    ).toEqual(["Forklift"]);

    await setAssetArchived(actor, a, true);
    expect((await listAssets({})).map((r) => r.asset.name)).toEqual([
      "Compressor",
    ]);
    expect(
      (await listAssets({ includeArchived: true })).map((r) => r.asset.name).sort(),
    ).toEqual(["Compressor", "Forklift"]);
  });
});
