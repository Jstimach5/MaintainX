import {
  pgTable,
  smallint,
  text,
  timestamp,
  check,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

/**
 * Organization-wide settings. Exactly one row (id = 1).
 *
 * `timezone` is an IANA timezone name (e.g. "America/Chicago"). All calendar
 * date logic (due dates, PM occurrence dates, "overdue" checks) is computed
 * against this timezone — never against the server's clock or UTC dates —
 * so due dates do not flip a day early in the evening.
 */
export const orgSettings = pgTable(
  "org_settings",
  {
    id: smallint("id").primaryKey().default(1),
    name: text("name").notNull().default("Maintenance Manager"),
    timezone: text("timezone").notNull().default("UTC"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [check("org_settings_singleton", sql`${table.id} = 1`)],
);
