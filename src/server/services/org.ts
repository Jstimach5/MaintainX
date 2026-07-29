import { cache } from "react";
import { db } from "@/server/db";
import { orgSettings } from "@/server/db/schema";

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
