/**
 * Additive stress fixtures for UI review — long names, deep location
 * paths, missing photos, many attachments, piles of overdue work. Run it
 * AFTER `npm run db:seed` to see how the interface behaves on the data
 * that actually breaks layouts:
 *
 *   npm run db:seed && npx tsx scripts/seed-stress.ts
 *
 * Additive only: it never truncates, and it refuses to run against a
 * production NODE_ENV like the main seed does.
 */
import { db, pool } from "@/server/db";
import { sites } from "@/server/db/schema";
import { asc } from "drizzle-orm";
import { createLocation } from "@/server/services/locations";
import { createAsset } from "@/server/services/assets";
import { createWorkOrder } from "@/server/services/workOrders";
import { createAttachment } from "@/server/services/attachments";
import { listUsers } from "@/server/services/users";

const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==",
  "base64",
);

async function main() {
  if (process.env.NODE_ENV === "production" && process.env.SEED_FORCE !== "1") {
    console.error("REFUSING to add stress fixtures: NODE_ENV=production.");
    process.exit(1);
  }

  const [site] = await db.select().from(sites).orderBy(asc(sites.id)).limit(1);
  if (!site) {
    console.error("No sites found — run `npm run db:seed` first.");
    process.exit(1);
  }
  const users = await listUsers();
  const admin = users.find((u) => u.role === "admin");
  const tech = users.find((u) => u.role === "technician");
  if (!admin) {
    console.error("No admin user found — run `npm run db:seed` first.");
    process.exit(1);
  }

  console.log("Adding stress fixtures…");

  // A location path deep enough to wrap on a phone.
  let parentId: number | undefined;
  for (const name of [
    "North Manufacturing Complex",
    "Building D — Secondary Processing",
    "Mezzanine Level 3 (East Wing)",
    "Utility Corridor C-14 Behind Packaging",
  ]) {
    parentId = await createLocation(admin.id, {
      siteId: site.id,
      parentId,
      name,
    });
  }

  // Long asset name, no photo — the fallback case for mobile lists.
  const longName =
    "Reciprocating Air Compressor Unit 12B — North Manufacturing Complex";
  const longAsset = await createAsset(admin.id, {
    name: longName,
    siteId: site.id,
    locationId: parentId,
    assetType: "Compressor",
    criticality: "critical",
    make: "IndustrialAir Systems International",
    model: "RAC-12B-HighCapacity-2200",
    serialNumber: "IASI-RAC-12B-000000000042",
  });

  // Attachment-heavy work order.
  const busyWo = await createWorkOrder(admin.id, {
    title:
      "Quarterly inspection and seal replacement on the reciprocating compressor unit",
    description: "Stress fixture: many attachments, long title, overdue.",
    siteId: site.id,
    locationId: parentId,
    assetIds: [longAsset],
    workType: "preventive",
    priority: "critical",
    assigneeIds: tech ? [tech.id] : undefined,
    dueAt: new Date(Date.now() - 5 * 86400000),
  });
  for (let i = 1; i <= 8; i++) {
    await createAttachment({
      actorId: admin.id,
      entityType: "work_order",
      entityId: busyWo,
      originalName: `inspection-photo-${String(i).padStart(2, "0")}.png`,
      mimeType: "image/png",
      data: PNG,
      category: i <= 4 ? "before" : "after",
    });
  }

  // A pile of overdue work, so the overdue treatments are exercised.
  for (let i = 1; i <= 3; i++) {
    await createWorkOrder(admin.id, {
      title: `Overdue stress work order ${i}`,
      siteId: site.id,
      workType: "reactive",
      priority: i === 1 ? "critical" : "high",
      assigneeIds: tech ? [tech.id] : undefined,
      dueAt: new Date(Date.now() - i * 3 * 86400000),
    });
  }

  console.log("Stress fixtures added.");
  await pool.end();
}

main().catch((err) => {
  console.error("Stress seed failed:", err);
  process.exit(1);
});
