import { beforeEach, describe, expect, it } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";
import { sql } from "drizzle-orm";
import { db } from "@/server/db";
import { createSite } from "@/server/services/sites";
import { createAsset } from "@/server/services/assets";
import {
  createAttachment,
  deleteAttachment,
  getAttachment,
  listAttachments,
} from "@/server/services/attachments";
import { storage } from "@/server/storage";
import { ServiceError } from "@/server/services/users";
import { makeUser, truncateAll } from "./helpers";

// Isolated storage dir per test run.
const tmpStorage = fs.mkdtempSync(path.join(os.tmpdir(), "cmms-storage-"));
process.env.STORAGE_DIR = tmpStorage;

// Tiny valid PNG (1x1 transparent pixel).
const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==",
  "base64",
);

let actor: number;
let assetId: number;

beforeEach(async () => {
  await truncateAll();
  await db.execute(sql`
    TRUNCATE TABLE attachments, asset_location_history, asset_status_history,
      assets, locations, sites RESTART IDENTITY CASCADE
  `);
  actor = (await makeUser({ role: "technician" })).id;
  const admin = (await makeUser({ role: "admin" })).id;
  const siteId = await createSite(admin, { name: "Main" });
  assetId = await createAsset(admin, {
    name: "Pump",
    siteId,
    criticality: "medium",
  });
});

describe("attachments", () => {
  it("stores file + row together; file readable after 'restart' (fresh read from disk)", async () => {
    const id = await createAttachment({
      actorId: actor,
      entityType: "asset",
      entityId: assetId,
      originalName: "before.png",
      mimeType: "image/png",
      data: PNG,
      category: "before",
    });
    const row = await getAttachment(id);
    expect(row?.sizeBytes).toBe(PNG.length);
    expect(row?.category).toBe("before");
    // Simulates the picture surviving a restart: nothing cached, plain disk read.
    expect(await storage.exists(row!.storedName)).toBe(true);
    const chunks: Buffer[] = [];
    for await (const c of storage.createReadStream(row!.storedName)) {
      chunks.push(c as Buffer);
    }
    expect(Buffer.concat(chunks).equals(PNG)).toBe(true);
  });

  it("rejects disallowed types (executables can never land)", async () => {
    await expect(
      createAttachment({
        actorId: actor,
        entityType: "asset",
        entityId: assetId,
        originalName: "evil.exe",
        mimeType: "application/x-msdownload",
        data: Buffer.from("MZ"),
      }),
    ).rejects.toThrow(ServiceError);
    await expect(
      createAttachment({
        actorId: actor,
        entityType: "asset",
        entityId: assetId,
        originalName: "page.html",
        mimeType: "text/html",
        data: Buffer.from("<script>alert(1)</script>"),
      }),
    ).rejects.toThrow(ServiceError);
  });

  it("rejects empty files", async () => {
    await expect(
      createAttachment({
        actorId: actor,
        entityType: "asset",
        entityId: assetId,
        originalName: "empty.png",
        mimeType: "image/png",
        data: Buffer.alloc(0),
      }),
    ).rejects.toThrow(/empty/i);
  });

  it("delete removes row and file", async () => {
    const id = await createAttachment({
      actorId: actor,
      entityType: "asset",
      entityId: assetId,
      originalName: "x.png",
      mimeType: "image/png",
      data: PNG,
    });
    const row = await getAttachment(id);
    await deleteAttachment(actor, id);
    expect(await getAttachment(id)).toBeNull();
    expect(await storage.exists(row!.storedName)).toBe(false);
  });

  it("lists by entity", async () => {
    await createAttachment({
      actorId: actor,
      entityType: "asset",
      entityId: assetId,
      originalName: "a.png",
      mimeType: "image/png",
      data: PNG,
    });
    await createAttachment({
      actorId: actor,
      entityType: "asset",
      entityId: assetId,
      originalName: "b.png",
      mimeType: "image/png",
      data: PNG,
    });
    const rows = await listAttachments("asset", assetId);
    expect(rows).toHaveLength(2);
  });
});
