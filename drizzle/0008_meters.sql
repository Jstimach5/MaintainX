CREATE TYPE "public"."trigger_type" AS ENUM('threshold', 'interval');--> statement-breakpoint
CREATE TABLE "meter_readings" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "meter_readings_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"meter_id" integer NOT NULL,
	"value" numeric(14, 3) NOT NULL,
	"reading_at" timestamp with time zone DEFAULT now() NOT NULL,
	"source" text DEFAULT 'manual' NOT NULL,
	"note" text,
	"is_rollover" boolean DEFAULT false NOT NULL,
	"corrects_reading_id" integer,
	"is_voided" boolean DEFAULT false NOT NULL,
	"recorded_by" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "meter_trigger_events" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "meter_trigger_events_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"trigger_id" integer NOT NULL,
	"reading_id" integer NOT NULL,
	"work_order_id" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "meter_triggers" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "meter_triggers_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"meter_id" integer NOT NULL,
	"name" text NOT NULL,
	"type" "trigger_type" NOT NULL,
	"threshold" numeric(14, 3),
	"interval_value" numeric(14, 3),
	"last_fired_value" numeric(14, 3),
	"skip_if_open" boolean DEFAULT true NOT NULL,
	"wo_title" text NOT NULL,
	"wo_description" text,
	"priority" "wo_priority" DEFAULT 'medium' NOT NULL,
	"procedure_template_id" integer,
	"assigned_team_id" integer,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_by" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "meters" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "meters_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"name" text NOT NULL,
	"description" text,
	"unit" text NOT NULL,
	"asset_id" integer,
	"location_id" integer,
	"must_increase" boolean DEFAULT true NOT NULL,
	"current_value" numeric(14, 3),
	"current_reading_at" timestamp with time zone,
	"warn_threshold" numeric(14, 3),
	"critical_threshold" numeric(14, 3),
	"is_active" boolean DEFAULT true NOT NULL,
	"created_by" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "meter_readings" ADD CONSTRAINT "meter_readings_meter_id_meters_id_fk" FOREIGN KEY ("meter_id") REFERENCES "public"."meters"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meter_readings" ADD CONSTRAINT "meter_readings_recorded_by_users_id_fk" FOREIGN KEY ("recorded_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meter_trigger_events" ADD CONSTRAINT "meter_trigger_events_trigger_id_meter_triggers_id_fk" FOREIGN KEY ("trigger_id") REFERENCES "public"."meter_triggers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meter_trigger_events" ADD CONSTRAINT "meter_trigger_events_reading_id_meter_readings_id_fk" FOREIGN KEY ("reading_id") REFERENCES "public"."meter_readings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meter_trigger_events" ADD CONSTRAINT "meter_trigger_events_work_order_id_work_orders_id_fk" FOREIGN KEY ("work_order_id") REFERENCES "public"."work_orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meter_triggers" ADD CONSTRAINT "meter_triggers_meter_id_meters_id_fk" FOREIGN KEY ("meter_id") REFERENCES "public"."meters"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meter_triggers" ADD CONSTRAINT "meter_triggers_procedure_template_id_procedure_templates_id_fk" FOREIGN KEY ("procedure_template_id") REFERENCES "public"."procedure_templates"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meter_triggers" ADD CONSTRAINT "meter_triggers_assigned_team_id_teams_id_fk" FOREIGN KEY ("assigned_team_id") REFERENCES "public"."teams"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meter_triggers" ADD CONSTRAINT "meter_triggers_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meters" ADD CONSTRAINT "meters_asset_id_assets_id_fk" FOREIGN KEY ("asset_id") REFERENCES "public"."assets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meters" ADD CONSTRAINT "meters_location_id_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meters" ADD CONSTRAINT "meters_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "meter_readings_meter_idx" ON "meter_readings" USING btree ("meter_id","reading_at");--> statement-breakpoint
CREATE UNIQUE INDEX "meter_trigger_events_uq" ON "meter_trigger_events" USING btree ("trigger_id","reading_id");--> statement-breakpoint
CREATE INDEX "meter_triggers_meter_idx" ON "meter_triggers" USING btree ("meter_id");--> statement-breakpoint
CREATE INDEX "meters_asset_idx" ON "meters" USING btree ("asset_id");