import { beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "@/server/db";
import { auditEvents } from "@/server/db/schema";
import { readOrgSettings, updateOrgSettings } from "@/server/services/org";
import { ServiceError } from "@/server/services/users";
import { makeUser, truncateAll } from "./helpers";

let adminId: number;

beforeEach(async () => {
  await truncateAll();
  adminId = (await makeUser({ role: "admin" })).id;
});

describe("org settings", () => {
  it("falls back to safe defaults when no row exists", async () => {
    const org = await readOrgSettings();
    expect(org.name).toBe("Maintenance Manager");
    expect(org.timezone).toBe("UTC");
    expect(org.requireCompletionApproval).toBe(false);
  });

  it("update persists all fields and is immediately visible uncached", async () => {
    await updateOrgSettings(adminId, {
      name: "Acme Industrial",
      timezone: "America/Chicago",
      requireCompletionApproval: true,
    });
    const org = await readOrgSettings();
    expect(org.name).toBe("Acme Industrial");
    expect(org.timezone).toBe("America/Chicago");
    expect(org.requireCompletionApproval).toBe(true);

    // Flip the toggle back; the change lands on the same singleton row.
    await updateOrgSettings(adminId, {
      name: "Acme Industrial",
      timezone: "America/Chicago",
      requireCompletionApproval: false,
    });
    expect((await readOrgSettings()).requireCompletionApproval).toBe(false);
  });

  it("rejects an unknown timezone and a blank name", async () => {
    await expect(
      updateOrgSettings(adminId, {
        name: "Acme",
        timezone: "Mars/Olympus_Mons",
        requireCompletionApproval: false,
      }),
    ).rejects.toThrow(/not recognized/i);
    await expect(
      updateOrgSettings(adminId, {
        name: "   ",
        timezone: "UTC",
        requireCompletionApproval: false,
      }),
    ).rejects.toThrow(ServiceError);
  });

  it("writes an audit event with previous and new values", async () => {
    await updateOrgSettings(adminId, {
      name: "Before Co",
      timezone: "UTC",
      requireCompletionApproval: false,
    });
    await updateOrgSettings(adminId, {
      name: "After Co",
      timezone: "America/Denver",
      requireCompletionApproval: true,
    });
    const events = await db
      .select()
      .from(auditEvents)
      .where(eq(auditEvents.action, "org.update"));
    expect(events).toHaveLength(2);
    const last = events[events.length - 1];
    expect(last.previousValue).toMatchObject({ name: "Before Co" });
    expect(last.newValue).toMatchObject({
      name: "After Co",
      timezone: "America/Denver",
      requireCompletionApproval: true,
    });
  });
});
