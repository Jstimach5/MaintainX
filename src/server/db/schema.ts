import {
  pgTable,
  pgEnum,
  smallint,
  integer,
  bigint,
  boolean,
  text,
  jsonb,
  timestamp,
  primaryKey,
  uniqueIndex,
  index,
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

// ---------------------------------------------------------------------------
// Users, roles, teams, sessions
// ---------------------------------------------------------------------------

export const userRole = pgEnum("user_role", [
  "admin",
  "manager",
  "technician",
  "requester",
]);

/**
 * Users are deactivated (is_active = false), never deleted: history and audit
 * rows reference them forever. Deactivation must also delete the user's
 * sessions rows in the same transaction (see services/users.ts) so live
 * logins are revoked immediately.
 */
export const users = pgTable(
  "users",
  {
    id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
    username: text("username").notNull(),
    passwordHash: text("password_hash").notNull(),
    displayName: text("display_name").notNull(),
    email: text("email"),
    role: userRole("role").notNull(),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("users_username_lower_uq").on(sql`lower(${table.username})`),
  ],
);

/**
 * DB-backed sessions. The raw 256-bit token lives only in the cookie; only
 * its sha256 is stored, so a leaked DB dump cannot be replayed as cookies.
 */
export const sessions = pgTable(
  "sessions",
  {
    tokenHash: text("token_hash").primaryKey(),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  },
  (table) => [index("sessions_user_idx").on(table.userId)],
);

export const teams = pgTable("teams", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  name: text("name").notNull().unique(),
  description: text("description"),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const teamMembers = pgTable(
  "team_members",
  {
    teamId: integer("team_id")
      .notNull()
      .references(() => teams.id, { onDelete: "cascade" }),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
  },
  (table) => [primaryKey({ columns: [table.teamId, table.userId] })],
);

// ---------------------------------------------------------------------------
// Audit trail (append-only; the application role never updates or deletes)
// ---------------------------------------------------------------------------

export const auditSource = pgEnum("audit_source", [
  "web",
  "portal",
  "worker",
  "import",
  "system",
]);

/**
 * Append-only audit events (§14). `entityType`/`entityId` are polymorphic so
 * one table covers every module — including future ones (parts, POs) without
 * schema changes. Never expose an UPDATE/DELETE path for this table in app
 * code; corrections are new events.
 */
export const auditEvents = pgTable(
  "audit_events",
  {
    id: bigint("id", { mode: "number" }).primaryKey().generatedAlwaysAsIdentity(),
    userId: integer("user_id").references(() => users.id),
    action: text("action").notNull(), // e.g. "user.create", "work_order.status_change"
    entityType: text("entity_type").notNull(),
    entityId: text("entity_id").notNull(),
    summary: text("summary"),
    previousValue: jsonb("previous_value"),
    newValue: jsonb("new_value"),
    source: auditSource("source").notNull().default("web"),
    correlationId: text("correlation_id"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("audit_entity_idx").on(table.entityType, table.entityId),
    index("audit_created_idx").on(table.createdAt),
    index("audit_user_idx").on(table.userId),
  ],
);
