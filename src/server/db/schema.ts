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
  /** When set, /portal/<token> is this site's public request form (§8). */
  portalToken: text("portal_token").unique(),
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
    /** Null for anonymous portal uploads. */
    uploadedBy: integer("uploaded_by").references(() => users.id),
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
    /** Set when generated by a PM plan (completion feeds floating basis). */
    pmPlanId: integer("pm_plan_id"),
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
// Work requests (§8) + notifications
// ---------------------------------------------------------------------------

export const requestStatus = pgEnum("request_status", [
  "submitted",
  "under_review",
  "approved",
  "declined",
  "converted",
  "canceled",
]);

export const requestSource = pgEnum("request_source", [
  "internal",
  "portal",
  "inspection",
]);

export const workRequests = pgTable(
  "work_requests",
  {
    id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
    requestNumber: text("request_number").notNull().unique(),
    title: text("title").notNull(),
    description: text("description"),
    /** Null for anonymous portal submissions; name/contact cover those. */
    requesterId: integer("requester_id").references(() => users.id),
    requesterName: text("requester_name"),
    requesterContact: text("requester_contact"),
    siteId: integer("site_id")
      .notNull()
      .references(() => sites.id),
    locationId: integer("location_id").references(() => locations.id),
    assetId: integer("asset_id").references(() => assets.id),
    priority: woPriority("priority").notNull().default("medium"),
    category: text("category"),
    requestedCompletionDate: date("requested_completion_date"),
    status: requestStatus("status").notNull().default("submitted"),
    declineReason: text("decline_reason"),
    /** Set exactly once on conversion — the duplicate-conversion guard. */
    convertedWorkOrderId: integer("converted_work_order_id").references(
      () => workOrders.id,
    ),
    /** WO that spawned this request (corrective from failed inspection). */
    originWorkOrderId: integer("origin_work_order_id").references(
      () => workOrders.id,
    ),
    source: requestSource("source").notNull().default("internal"),
    decidedBy: integer("decided_by").references(() => users.id),
    decidedAt: timestamp("decided_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("requests_status_idx").on(table.status),
    index("requests_site_idx").on(table.siteId),
    index("requests_requester_idx").on(table.requesterId),
    uniqueIndex("requests_converted_wo_uq")
      .on(table.convertedWorkOrderId)
      .where(sql`${table.convertedWorkOrderId} IS NOT NULL`),
  ],
);

export const notifications = pgTable(
  "notifications",
  {
    id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    type: text("type").notNull(), // e.g. "request.submitted"
    title: text("title").notNull(),
    body: text("body"),
    link: text("link"),
    isRead: boolean("is_read").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("notifications_user_idx").on(table.userId, table.isRead),
  ],
);

// ---------------------------------------------------------------------------
// Preventive maintenance (§9)
// ---------------------------------------------------------------------------

export const pmBasis = pgEnum("pm_basis", ["fixed", "floating"]);
export const pmRecurUnit = pgEnum("pm_recur_unit", [
  "day",
  "week",
  "month",
  "year",
]);

/**
 * A PM plan generates work orders on a schedule. `fixed` marches from the
 * original due dates; `floating` re-anchors from the last completion.
 * All date math happens in the org timezone (DECISIONS.md #5).
 * Meter-based triggering joins in Phase 8 via meter_triggers referencing
 * plans — the data model stays additive.
 */
export const pmPlans = pgTable(
  "pm_plans",
  {
    id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
    name: text("name").notNull(),
    description: text("description"),
    siteId: integer("site_id")
      .notNull()
      .references(() => sites.id),
    locationId: integer("location_id").references(() => locations.id),
    assetId: integer("asset_id").references(() => assets.id),
    assignedTeamId: integer("assigned_team_id").references(() => teams.id),
    /** Assignees for generated WOs. */
    assigneeIds: integer("assignee_ids").array(),
    procedureTemplateId: integer("procedure_template_id").references(
      () => procedureTemplates.id,
    ),
    priority: woPriority("priority").notNull().default("medium"),
    workType: woType("work_type").notNull().default("preventive"),
    estimatedMinutes: integer("estimated_minutes"),
    plannedDowntimeMinutes: integer("planned_downtime_minutes"),
    basis: pmBasis("basis").notNull().default("floating"),
    recurUnit: pmRecurUnit("recur_unit").notNull(),
    recurInterval: integer("recur_interval").notNull(),
    /** Generate the WO this many days before the due date. */
    leadDays: integer("lead_days").notNull().default(0),
    startDate: date("start_date").notNull(),
    endDate: date("end_date"),
    /** Next due date (YYYY-MM-DD, org timezone). */
    nextDue: date("next_due").notNull(),
    isPaused: boolean("is_paused").notNull().default(false),
    lastGeneratedAt: timestamp("last_generated_at", { withTimezone: true }),
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
    index("pm_plans_due_idx").on(table.nextDue),
    check("pm_recur_interval_positive", sql`${table.recurInterval} > 0`),
    check("pm_lead_days_nonneg", sql`${table.leadDays} >= 0`),
  ],
);

/**
 * One row per generated occurrence. UNIQUE (plan, occurrence_key) is THE
 * idempotency guarantee (§9/DECISIONS.md #6): re-running the scheduler can
 * never double-generate. `workOrderId` null means a crash happened between
 * claiming the occurrence and creating the WO — the tick repairs those.
 */
export const pmOccurrences = pgTable(
  "pm_occurrences",
  {
    id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
    planId: integer("plan_id")
      .notNull()
      .references(() => pmPlans.id, { onDelete: "cascade" }),
    occurrenceKey: text("occurrence_key").notNull(), // due date YYYY-MM-DD
    workOrderId: integer("work_order_id").references(() => workOrders.id),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("pm_occurrence_uq").on(table.planId, table.occurrenceKey),
  ],
);

// ---------------------------------------------------------------------------
// Meters (§10)
// ---------------------------------------------------------------------------

/**
 * Numeric measurements on an asset or location (hours, miles, cycles,
 * temperature, …). `source` on readings is the adapter seam for future IoT
 * ingestion — automated feeds insert rows the same way manual entry does.
 */
export const meters = pgTable(
  "meters",
  {
    id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
    name: text("name").notNull(),
    description: text("description"),
    unit: text("unit").notNull(), // e.g. "hours", "miles", "°F"
    assetId: integer("asset_id").references(() => assets.id),
    locationId: integer("location_id").references(() => locations.id),
    /** Monotonic meters (hours/miles) reject decreasing readings. */
    mustIncrease: boolean("must_increase").notNull().default(true),
    currentValue: numeric("current_value", { precision: 14, scale: 3 }),
    currentReadingAt: timestamp("current_reading_at", { withTimezone: true }),
    warnThreshold: numeric("warn_threshold", { precision: 14, scale: 3 }),
    criticalThreshold: numeric("critical_threshold", { precision: 14, scale: 3 }),
    isActive: boolean("is_active").notNull().default(true),
    createdBy: integer("created_by")
      .notNull()
      .references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [index("meters_asset_idx").on(table.assetId)],
);

export const meterReadings = pgTable(
  "meter_readings",
  {
    id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
    meterId: integer("meter_id")
      .notNull()
      .references(() => meters.id, { onDelete: "cascade" }),
    value: numeric("value", { precision: 14, scale: 3 }).notNull(),
    readingAt: timestamp("reading_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    source: text("source").notNull().default("manual"),
    note: text("note"),
    /** Explicit odometer-style rollover acknowledgment. */
    isRollover: boolean("is_rollover").notNull().default(false),
    /** Corrections point at the reading they fix; originals stay (§10). */
    correctsReadingId: integer("corrects_reading_id"),
    isVoided: boolean("is_voided").notNull().default(false),
    recordedBy: integer("recorded_by").references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [index("meter_readings_meter_idx").on(table.meterId, table.readingAt)],
);

export const triggerType = pgEnum("trigger_type", ["threshold", "interval"]);

/**
 * Meter-driven WO generation (§10). Exactly-once: the watermark
 * (lastFiredValue) advances in the same transaction as the fired event, and
 * UNIQUE (trigger, reading) makes reprocessing a reading a no-op.
 */
export const meterTriggers = pgTable(
  "meter_triggers",
  {
    id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
    meterId: integer("meter_id")
      .notNull()
      .references(() => meters.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    type: triggerType("type").notNull(),
    /** threshold type: fire when a reading crosses this value upward. */
    threshold: numeric("threshold", { precision: 14, scale: 3 }),
    /** interval type: fire every N units of usage. */
    intervalValue: numeric("interval_value", { precision: 14, scale: 3 }),
    lastFiredValue: numeric("last_fired_value", { precision: 14, scale: 3 }),
    /** Skip firing while the last generated WO is still open. */
    skipIfOpen: boolean("skip_if_open").notNull().default(true),
    woTitle: text("wo_title").notNull(),
    woDescription: text("wo_description"),
    priority: woPriority("priority").notNull().default("medium"),
    procedureTemplateId: integer("procedure_template_id").references(
      () => procedureTemplates.id,
    ),
    assignedTeamId: integer("assigned_team_id").references(() => teams.id),
    isActive: boolean("is_active").notNull().default(true),
    createdBy: integer("created_by")
      .notNull()
      .references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [index("meter_triggers_meter_idx").on(table.meterId)],
);

export const meterTriggerEvents = pgTable(
  "meter_trigger_events",
  {
    id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
    triggerId: integer("trigger_id")
      .notNull()
      .references(() => meterTriggers.id, { onDelete: "cascade" }),
    readingId: integer("reading_id")
      .notNull()
      .references(() => meterReadings.id, { onDelete: "cascade" }),
    workOrderId: integer("work_order_id").references(() => workOrders.id),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("meter_trigger_events_uq").on(table.triggerId, table.readingId),
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
