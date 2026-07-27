CREATE TYPE "public"."pm_basis" AS ENUM('fixed', 'floating');--> statement-breakpoint
CREATE TYPE "public"."pm_recur_unit" AS ENUM('day', 'week', 'month', 'year');--> statement-breakpoint
CREATE TABLE "pm_occurrences" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "pm_occurrences_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"plan_id" integer NOT NULL,
	"occurrence_key" text NOT NULL,
	"work_order_id" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pm_plans" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "pm_plans_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"name" text NOT NULL,
	"description" text,
	"site_id" integer NOT NULL,
	"location_id" integer,
	"asset_id" integer,
	"assigned_team_id" integer,
	"assignee_ids" integer[],
	"procedure_template_id" integer,
	"priority" "wo_priority" DEFAULT 'medium' NOT NULL,
	"work_type" "wo_type" DEFAULT 'preventive' NOT NULL,
	"estimated_minutes" integer,
	"planned_downtime_minutes" integer,
	"basis" "pm_basis" DEFAULT 'floating' NOT NULL,
	"recur_unit" "pm_recur_unit" NOT NULL,
	"recur_interval" integer NOT NULL,
	"lead_days" integer DEFAULT 0 NOT NULL,
	"start_date" date NOT NULL,
	"end_date" date,
	"next_due" date NOT NULL,
	"is_paused" boolean DEFAULT false NOT NULL,
	"last_generated_at" timestamp with time zone,
	"created_by" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "pm_recur_interval_positive" CHECK ("pm_plans"."recur_interval" > 0),
	CONSTRAINT "pm_lead_days_nonneg" CHECK ("pm_plans"."lead_days" >= 0)
);
--> statement-breakpoint
ALTER TABLE "work_orders" ADD COLUMN "pm_plan_id" integer;--> statement-breakpoint
ALTER TABLE "pm_occurrences" ADD CONSTRAINT "pm_occurrences_plan_id_pm_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."pm_plans"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pm_occurrences" ADD CONSTRAINT "pm_occurrences_work_order_id_work_orders_id_fk" FOREIGN KEY ("work_order_id") REFERENCES "public"."work_orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pm_plans" ADD CONSTRAINT "pm_plans_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pm_plans" ADD CONSTRAINT "pm_plans_location_id_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pm_plans" ADD CONSTRAINT "pm_plans_asset_id_assets_id_fk" FOREIGN KEY ("asset_id") REFERENCES "public"."assets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pm_plans" ADD CONSTRAINT "pm_plans_assigned_team_id_teams_id_fk" FOREIGN KEY ("assigned_team_id") REFERENCES "public"."teams"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pm_plans" ADD CONSTRAINT "pm_plans_procedure_template_id_procedure_templates_id_fk" FOREIGN KEY ("procedure_template_id") REFERENCES "public"."procedure_templates"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pm_plans" ADD CONSTRAINT "pm_plans_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "pm_occurrence_uq" ON "pm_occurrences" USING btree ("plan_id","occurrence_key");--> statement-breakpoint
CREATE INDEX "pm_plans_due_idx" ON "pm_plans" USING btree ("next_due");