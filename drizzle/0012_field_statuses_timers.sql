ALTER TYPE "public"."wo_status" ADD VALUE 'paused' BEFORE 'on_hold';--> statement-breakpoint
ALTER TYPE "public"."wo_status" ADD VALUE 'waiting_approval' BEFORE 'completed';--> statement-breakpoint
CREATE TABLE "work_order_timers" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "work_order_timers_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"work_order_id" integer NOT NULL,
	"user_id" integer NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"stopped_at" timestamp with time zone,
	"accumulated_minutes" integer DEFAULT 0 NOT NULL,
	"carried_forward" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
ALTER TABLE "org_settings" ADD COLUMN "require_completion_approval" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "work_order_timers" ADD CONSTRAINT "work_order_timers_work_order_id_work_orders_id_fk" FOREIGN KEY ("work_order_id") REFERENCES "public"."work_orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_order_timers" ADD CONSTRAINT "work_order_timers_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "wo_timers_wo_idx" ON "work_order_timers" USING btree ("work_order_id");--> statement-breakpoint
CREATE UNIQUE INDEX "wo_timers_one_active_per_user" ON "work_order_timers" USING btree ("user_id") WHERE "work_order_timers"."stopped_at" IS NULL;