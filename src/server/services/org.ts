import { cache } from "react";
import { db } from "@/server/db";
import { orgSettings } from "@/server/db/schema";

/** Org settings singleton (request-cached). Timezone drives all calendar logic. */
export const getOrgSettings = cache(async () => {
  const rows = await db.select().from(orgSettings).limit(1);
  return (
    rows[0] ?? {
      id: 1,
      name: "Maintenance Manager",
      timezone: "UTC",
      createdAt: new Date(),
      updatedAt: new Date(),
    }
  );
});
