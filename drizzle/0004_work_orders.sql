CREATE TYPE "public"."wo_priority" AS ENUM('none', 'low', 'medium', 'high', 'critical');--> statement-breakpoint
CREATE TYPE "public"."wo_source" AS ENUM('manual', 'request', 'import', 'pm', 'meter');--> statement-breakpoint
CREATE TYPE "public"."wo_status" AS ENUM('draft', 'open', 'assigned', 'in_progress', 'on_hold', 'waiting', 'completed', 'canceled');--> statement-breakpoint
CREATE TYPE "public"."wo_type" AS ENUM('preventive', 'reactive', 'inspection', 'corrective', 'safety', 'project', 'other');--> statement-breakpoint
CREATE TABLE "comments" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "comments_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"entity_type" text NOT NULL,
	"entity_id" integer NOT NULL,
	"user_id" integer NOT NULL,
	"body" text NOT NULL,
	"is_internal" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "work_order_assets" (
	"work_order_id" integer NOT NULL,
	"asset_id" integer NOT NULL,
	"is_primary" boolean DEFAULT false NOT NULL,
	CONSTRAINT "work_order_assets_work_order_id_asset_id_pk" PRIMARY KEY("work_order_id","asset_id")
);
--> statement-breakpoint
CREATE TABLE "work_order_assignments" (
	"work_order_id" integer NOT NULL,
	"user_id" integer NOT NULL,
	"assigned_by" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "work_order_assignments_work_order_id_user_id_pk" PRIMARY KEY("work_order_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "work_order_labor" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "work_order_labor_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"work_order_id" integer NOT NULL,
	"user_id" integer NOT NULL,
	"minutes" integer NOT NULL,
	"note" text,
	"work_date" date,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "wo_labor_minutes_positive" CHECK ("work_order_labor"."minutes" > 0)
);
--> statement-breakpoint
CREATE TABLE "work_order_status_history" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "work_order_status_history_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"work_order_id" integer NOT NULL,
	"status" "wo_status" NOT NULL,
	"previous_status" "wo_status",
	"note" text,
	"changed_by" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "work_orders" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "work_orders_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"wo_number" text NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"site_id" integer NOT NULL,
	"location_id" integer,
	"parent_work_order_id" integer,
	"work_type" "wo_type" DEFAULT 'reactive' NOT NULL,
	"priority" "wo_priority" DEFAULT 'medium' NOT NULL,
	"status" "wo_status" DEFAULT 'open' NOT NULL,
	"tags" text[],
	"assigned_team_id" integer,
	"requester_id" integer,
	"planned_start_at" timestamp with time zone,
	"due_at" timestamp with time zone,
	"actual_start_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"estimated_minutes" integer,
	"planned_downtime_minutes" integer,
	"actual_downtime_minutes" integer,
	"labor_cost" numeric(12, 2),
	"other_cost" numeric(12, 2),
	"completion_notes" text,
	"source" "wo_source" DEFAULT 'manual' NOT NULL,
	"external_id" text,
	"created_by" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "work_orders_wo_number_unique" UNIQUE("wo_number")
);
--> statement-breakpoint
ALTER TABLE "comments" ADD CONSTRAINT "comments_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_order_assets" ADD CONSTRAINT "work_order_assets_work_order_id_work_orders_id_fk" FOREIGN KEY ("work_order_id") REFERENCES "public"."work_orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_order_assets" ADD CONSTRAINT "work_order_assets_asset_id_assets_id_fk" FOREIGN KEY ("asset_id") REFERENCES "public"."assets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_order_assignments" ADD CONSTRAINT "work_order_assignments_work_order_id_work_orders_id_fk" FOREIGN KEY ("work_order_id") REFERENCES "public"."work_orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_order_assignments" ADD CONSTRAINT "work_order_assignments_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_order_assignments" ADD CONSTRAINT "work_order_assignments_assigned_by_users_id_fk" FOREIGN KEY ("assigned_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_order_labor" ADD CONSTRAINT "work_order_labor_work_order_id_work_orders_id_fk" FOREIGN KEY ("work_order_id") REFERENCES "public"."work_orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_order_labor" ADD CONSTRAINT "work_order_labor_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_order_status_history" ADD CONSTRAINT "work_order_status_history_work_order_id_work_orders_id_fk" FOREIGN KEY ("work_order_id") REFERENCES "public"."work_orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_order_status_history" ADD CONSTRAINT "work_order_status_history_changed_by_users_id_fk" FOREIGN KEY ("changed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_orders" ADD CONSTRAINT "work_orders_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_orders" ADD CONSTRAINT "work_orders_location_id_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_orders" ADD CONSTRAINT "work_orders_assigned_team_id_teams_id_fk" FOREIGN KEY ("assigned_team_id") REFERENCES "public"."teams"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_orders" ADD CONSTRAINT "work_orders_requester_id_users_id_fk" FOREIGN KEY ("requester_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_orders" ADD CONSTRAINT "work_orders_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_orders" ADD CONSTRAINT "wo_parent_fk" FOREIGN KEY ("parent_work_order_id") REFERENCES "public"."work_orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "comments_entity_idx" ON "comments" USING btree ("entity_type","entity_id");--> statement-breakpoint
CREATE INDEX "wo_assets_asset_idx" ON "work_order_assets" USING btree ("asset_id");--> statement-breakpoint
CREATE INDEX "wo_assign_user_idx" ON "work_order_assignments" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "wo_labor_wo_idx" ON "work_order_labor" USING btree ("work_order_id");--> statement-breakpoint
CREATE INDEX "wo_status_hist_idx" ON "work_order_status_history" USING btree ("work_order_id");--> statement-breakpoint
CREATE INDEX "wo_status_idx" ON "work_orders" USING btree ("status");--> statement-breakpoint
CREATE INDEX "wo_site_idx" ON "work_orders" USING btree ("site_id");--> statement-breakpoint
CREATE INDEX "wo_due_idx" ON "work_orders" USING btree ("due_at");--> statement-breakpoint
CREATE INDEX "wo_team_idx" ON "work_orders" USING btree ("assigned_team_id");--> statement-breakpoint
CREATE UNIQUE INDEX "wo_external_id_uq" ON "work_orders" USING btree ("external_id") WHERE "work_orders"."external_id" IS NOT NULL;