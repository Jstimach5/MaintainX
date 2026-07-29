import { cache } from "react";
import { db } from "@/server/db";
import { orgSettings } from "@/server/db/schema";
import { recordAudit } from "./audit";
import { ServiceError } from "./users";

/**
 * Uncached read of the org settings singleton. Service code that branches
 * on a setting must use this: `cache()` is scoped to a render pass, and
 * outside one (worker jobs, tests) a memoized value can outlive a change.
 */
export async function readOrgSettings() {
  const rows = await db.select().from(orgSettings).limit(1);
  return (
    rows[0] ?? {
      id: 1,
      name: "Maintenance Manager",
      timezone: "UTC",
      requireCompletionApproval: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    }
  );
}

/** Org settings singleton (request-cached). Timezone drives all calendar logic. */
export const getOrgSettings = cache(async () => {
  const rows = await db.select().from(orgSettings).limit(1);
  return (
    rows[0] ?? {
      id: 1,
      name: "Maintenance Manager",
      timezone: "UTC",
      requireCompletionApproval: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    }
  );
});

export type OrgSettingsInput = {
  name: string;
  timezone: string;
  requireCompletionApproval: boolean;
};

/**
 * Admin-facing settings update (the only writer besides first-run setup).
 * The timezone check mirrors setup: constructing a DateTimeFormat with an
 * unknown zone throws, which beats maintaining our own zone list.
 */
export async function updateOrgSettings(
  actorId: number,
  input: OrgSettingsInput,
): Promise<void> {
  const name = input.name.trim();
  if (!name) throw new ServiceError("Organization name is required.");
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: input.timezone });
  } catch {
    throw new ServiceError("That timezone is not recognized.");
  }
  const previous = await readOrgSettings();
  await db.transaction(async (tx) => {
    await tx
      .insert(orgSettings)
      .values({
        id: 1,
        name,
        timezone: input.timezone,
        requireCompletionApproval: input.requireCompletionApproval,
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: orgSettings.id,
        set: {
          name,
          timezone: input.timezone,
          requireCompletionApproval: input.requireCompletionApproval,
          updatedAt: new Date(),
        },
      });
    await recordAudit(tx, {
      userId: actorId,
      action: "org.update",
      entityType: "org_settings",
      entityId: 1,
      summary: `Updated organization settings (${name}, ${input.timezone}, approval ${input.requireCompletionApproval ? "on" : "off"})`,
      previousValue: {
        name: previous.name,
        timezone: previous.timezone,
        requireCompletionApproval: previous.requireCompletionApproval,
      },
      newValue: {
        name,
        timezone: input.timezone,
        requireCompletionApproval: input.requireCompletionApproval,
      },
    });
  });
}
