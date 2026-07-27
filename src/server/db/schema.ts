import {
  pgTable,
  pgEnum,
  smallint,
  integer,
  bigint,
  boolean,
  text,
  jsonb,
  date,
  numeric,
  timestamp,
  primaryKey,
  uniqueIndex,
  index,
  foreignKey,
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
// Sites and nested locations (§5)
// ---------------------------------------------------------------------------

/**
 * Sites and locations are archive-only (is_active flag) — never hard-deleted,
 * because assets, work orders, and history reference them forever.
 */
export const sites = pgTable("sites", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  name: text("name").notNull().unique(),
  code: text("code"),
  address: text("address"),
  description: text("description"),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

/**
 * Locations nest arbitrarily deep within one site (building → floor → room).
 * parent must belong to the same site; re-parenting must not create cycles
 * (enforced in services/locations.ts).
 */
export const locations = pgTable(
  "locations",
  {
    id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
    siteId: integer("site_id")
      .notNull()
      .references(() => sites.id),
    parentId: integer("parent_id"), // self-FK added via foreignKey below
    name: text("name").notNull(),
    code: text("code"),
    description: text("description"),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("locations_site_idx").on(table.siteId),
    index("locations_parent_idx").on(table.parentId),
    foreignKey({
      columns: [table.parentId],
      foreignColumns: [table.id],
      name: "locations_parent_fk",
    }),
  ],
);

// ---------------------------------------------------------------------------
// Attachments (polymorphic pictures/files for every module)
// ---------------------------------------------------------------------------

export const attachmentCategory = pgEnum("attachment_category", [
  "general",
  "main",
  "before",
  "during",
  "after",
  "inspection",
  "damage",
]);

/**
 * One attachment table for the whole app. `entityType` is app-validated text
 * (asset, work_order, request, procedure_response, meter_reading, comment)
 * so future modules (parts, POs) need no schema change. Files live on disk
 * via the storage adapter under `storedName`; DB row and file are created
 * and deleted together (services/attachments.ts).
 */
export const attachments = pgTable(
  "attachments",
  {
    id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
    entityType: text("entity_type").notNull(),
    entityId: integer("entity_id").notNull(),
    category: attachmentCategory("category").notNull().default("general"),
    storedName: text("stored_name").notNull().unique(),
    originalName: text("original_name"),
    mimeType: text("mime_type").notNull(),
    sizeBytes: integer("size_bytes").notNull(),
    caption: text("caption"),
    uploadedBy: integer("uploaded_by")
      .notNull()
      .references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [index("attachments_entity_idx").on(table.entityType, table.entityId)],
);

// ---------------------------------------------------------------------------
// Assets (§6) + status/location history
// ---------------------------------------------------------------------------

export const assetStatus = pgEnum("asset_status", [
  "online",
  "offline",
  "limited",
  "planned_downtime",
  "unplanned_downtime",
  "out_for_repair",
  "retired",
  "not_tracked",
]);

export const criticality = pgEnum("criticality", [
  "low",
  "medium",
  "high",
  "critical",
]);

export const assets = pgTable(
  "assets",
  {
    id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
    assetNumber: text("asset_number").notNull().unique(),
    name: text("name").notNull(),
    description: text("description"),
    assetType: text("asset_type"),
    siteId: integer("site_id")
      .notNull()
      .references(() => sites.id),
    locationId: integer("location_id").references(() => locations.id),
    parentAssetId: integer("parent_asset_id"), // self-FK below
    status: assetStatus("status").notNull().default("online"),
    make: text("make"),
    model: text("model"),
    serialNumber: text("serial_number"),
    year: integer("year"),
    purchaseDate: date("purchase_date"),
    inServiceDate: date("in_service_date"),
    warrantyInfo: text("warranty_info"),
    criticality: criticality("criticality").notNull().default("medium"),
    responsibleTeamId: integer("responsible_team_id").references(() => teams.id),
    responsibleUserId: integer("responsible_user_id").references(() => users.id),
    mainAttachmentId: integer("main_attachment_id").references(
      () => attachments.id,
    ),
    notes: text("notes"),
    tags: text("tags").array(),
    /** Stable QR token; printed labels resolve /a/<qrToken> to this asset. */
    qrToken: text("qr_token").notNull().unique(),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("assets_site_idx").on(table.siteId),
    index("assets_location_idx").on(table.locationId),
    index("assets_status_idx").on(table.status),
    index("assets_parent_idx").on(table.parentAssetId),
    foreignKey({
      columns: [table.parentAssetId],
      foreignColumns: [table.id],
      name: "assets_parent_fk",
    }),
  ],
);

export const assetStatusHistory = pgTable(
  "asset_status_history",
  {
    id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
    assetId: integer("asset_id")
      .notNull()
      .references(() => assets.id),
    status: assetStatus("status").notNull(),
    previousStatus: assetStatus("previous_status"),
    note: text("note"),
    changedBy: integer("changed_by")
      .notNull()
      .references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [index("asset_status_hist_idx").on(table.assetId)],
);

export const assetLocationHistory = pgTable(
  "asset_location_history",
  {
    id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
    assetId: integer("asset_id")
      .notNull()
      .references(() => assets.id),
    siteId: integer("site_id")
      .notNull()
      .references(() => sites.id),
    locationId: integer("location_id").references(() => locations.id),
    note: text("note"),
    movedBy: integer("moved_by")
      .notNull()
      .references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [index("asset_location_hist_idx").on(table.assetId)],
);

// ---------------------------------------------------------------------------
// Work orders (§7)
// ---------------------------------------------------------------------------

export const woStatus = pgEnum("wo_status", [
  "draft",
  "open",
  "assigned",
  "in_progress",
  "on_hold",
  "waiting",
  "completed",
  "canceled",
]);

export const woPriority = pgEnum("wo_priority", [
  "none",
  "low",
  "medium",
  "high",
  "critical",
]);

export const woType = pgEnum("wo_type", [
  "preventive",
  "reactive",
  "inspection",
  "corrective",
  "safety",
  "project",
  "other",
]);

export const woSource = pgEnum("wo_source", [
  "manual",
  "request",
  "import",
  "pm",
  "meter",
]);

export const workOrders = pgTable(
  "work_orders",
  {
    id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
    woNumber: text("wo_number").notNull().unique(),
    title: text("title").notNull(),
    description: text("description"),
    siteId: integer("site_id")
      .notNull()
      .references(() => sites.id),
    locationId: integer("location_id").references(() => locations.id),
    parentWorkOrderId: integer("parent_work_order_id"), // self-FK below
    workType: woType("work_type").notNull().default("reactive"),
    priority: woPriority("priority").notNull().default("medium"),
    status: woStatus("status").notNull().default("open"),
    tags: text("tags").array(),
    assignedTeamId: integer("assigned_team_id").references(() => teams.id),
    requesterId: integer("requester_id").references(() => users.id),
    plannedStartAt: timestamp("planned_start_at", { withTimezone: true }),
    dueAt: timestamp("due_at", { withTimezone: true }),
    actualStartAt: timestamp("actual_start_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    estimatedMinutes: integer("estimated_minutes"),
    plannedDowntimeMinutes: integer("planned_downtime_minutes"),
    actualDowntimeMinutes: integer("actual_downtime_minutes"),
    laborCost: numeric("labor_cost", { precision: 12, scale: 2 }),
    otherCost: numeric("other_cost", { precision: 12, scale: 2 }),
    completionNotes: text("completion_notes"),
    /** Set by a failed inspection step (§7); cleared manually by a manager. */
    flagged: boolean("flagged").notNull().default(false),
    source: woSource("source").notNull().default("manual"),
    /** Stable identifier for imported/external records (§12). */
    externalId: text("external_id"),
    createdBy: integer("created_by")
      .notNull()
      .references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("wo_status_idx").on(table.status),
    index("wo_site_idx").on(table.siteId),
    index("wo_due_idx").on(table.dueAt),
    index("wo_team_idx").on(table.assignedTeamId),
    uniqueIndex("wo_external_id_uq")
      .on(table.externalId)
      .where(sql`${table.externalId} IS NOT NULL`),
    foreignKey({
      columns: [table.parentWorkOrderId],
      foreignColumns: [table.id],
      name: "wo_parent_fk",
    }),
  ],
);

/** Multi-asset support (§5/§7); exactly one row per WO may be primary. */
export const workOrderAssets = pgTable(
  "work_order_assets",
  {
    workOrderId: integer("work_order_id")
      .notNull()
      .references(() => workOrders.id, { onDelete: "cascade" }),
    assetId: integer("asset_id")
      .notNull()
      .references(() => assets.id),
    isPrimary: boolean("is_primary").notNull().default(false),
  },
  (table) => [
    primaryKey({ columns: [table.workOrderId, table.assetId] }),
    index("wo_assets_asset_idx").on(table.assetId),
  ],
);

export const workOrderAssignments = pgTable(
  "work_order_assignments",
  {
    workOrderId: integer("work_order_id")
      .notNull()
      .references(() => workOrders.id, { onDelete: "cascade" }),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id),
    assignedBy: integer("assigned_by")
      .notNull()
      .references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.workOrderId, table.userId] }),
    index("wo_assign_user_idx").on(table.userId),
  ],
);

export const workOrderStatusHistory = pgTable(
  "work_order_status_history",
  {
    id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
    workOrderId: integer("work_order_id")
      .notNull()
      .references(() => workOrders.id, { onDelete: "cascade" }),
    status: woStatus("status").notNull(),
    previousStatus: woStatus("previous_status"),
    note: text("note"),
    changedBy: integer("changed_by")
      .notNull()
      .references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [index("wo_status_hist_idx").on(table.workOrderId)],
);

/** Per-technician labor time (§7); actual labor = SUM over entries. */
export const workOrderLabor = pgTable(
  "work_order_labor",
  {
    id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
    workOrderId: integer("work_order_id")
      .notNull()
      .references(() => workOrders.id, { onDelete: "cascade" }),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id),
    minutes: integer("minutes").notNull(),
    note: text("note"),
    workDate: date("work_date"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("wo_labor_wo_idx").on(table.workOrderId),
    check("wo_labor_minutes_positive", sql`${table.minutes} > 0`),
  ],
);

/**
 * Comments — polymorphic (work_order, request) so the request module reuses
 * it. `isInternal` marks manager-only notes that requesters must never see.
 */
export const comments = pgTable(
  "comments",
  {
    id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
    entityType: text("entity_type").notNull(),
    entityId: integer("entity_id").notNull(),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id),
    body: text("body").notNull(),
    isInternal: boolean("is_internal").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [index("comments_entity_idx").on(table.entityType, table.entityId)],
);

// ---------------------------------------------------------------------------
// Procedures (§7): reusable templates, immutable versions, per-WO snapshots
// ---------------------------------------------------------------------------

export const procedureTemplates = pgTable("procedure_templates", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  name: text("name").notNull(),
  description: text("description"),
  isActive: boolean("is_active").notNull().default(true),
  /** Latest version number; versions themselves are immutable rows. */
  currentVersion: integer("current_version").notNull().default(0),
  createdBy: integer("created_by")
    .notNull()
    .references(() => users.id),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

/**
 * Every save of a template's steps creates a NEW immutable version row; the
 * steps live here as JSONB (see ProcedureStep in services/procedures.ts).
 */
export const procedureVersions = pgTable(
  "procedure_versions",
  {
    id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
    templateId: integer("template_id")
      .notNull()
      .references(() => procedureTemplates.id, { onDelete: "cascade" }),
    version: integer("version").notNull(),
    steps: jsonb("steps").notNull(),
    createdBy: integer("created_by")
      .notNull()
      .references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("procedure_versions_uq").on(table.templateId, table.version),
  ],
);

/**
 * A procedure attached to a work order. `stepsSnapshot` is a full copy taken
 * at attach time — later template edits NEVER change what a historical WO
 * shows or what was answered (§7).
 */
export const woProcedureInstances = pgTable(
  "wo_procedure_instances",
  {
    id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
    workOrderId: integer("work_order_id")
      .notNull()
      .references(() => workOrders.id, { onDelete: "cascade" }),
    templateId: integer("template_id").references(() => procedureTemplates.id, {
      onDelete: "set null",
    }),
    templateVersion: integer("template_version"),
    name: text("name").notNull(),
    stepsSnapshot: jsonb("steps_snapshot").notNull(),
    attachedBy: integer("attached_by")
      .notNull()
      .references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [index("wo_proc_wo_idx").on(table.workOrderId)],
);

/** One row per answered step; re-answering upserts (§7 responses). */
export const procedureResponses = pgTable(
  "procedure_responses",
  {
    id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
    instanceId: integer("instance_id")
      .notNull()
      .references(() => woProcedureInstances.id, { onDelete: "cascade" }),
    stepIndex: integer("step_index").notNull(),
    value: jsonb("value").notNull(),
    isFailure: boolean("is_failure").notNull().default(false),
    respondedBy: integer("responded_by")
      .notNull()
      .references(() => users.id),
    respondedAt: timestamp("responded_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("procedure_responses_uq").on(table.instanceId, table.stepIndex),
  ],
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
