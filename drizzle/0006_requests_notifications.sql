CREATE TYPE "public"."request_source" AS ENUM('internal', 'portal', 'inspection');--> statement-breakpoint
CREATE TYPE "public"."request_status" AS ENUM('submitted', 'under_review', 'approved', 'declined', 'converted', 'canceled');--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "notifications_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"user_id" integer NOT NULL,
	"type" text NOT NULL,
	"title" text NOT NULL,
	"body" text,
	"link" text,
	"is_read" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "work_requests" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "work_requests_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"request_number" text NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"requester_id" integer,
	"requester_name" text,
	"requester_contact" text,
	"site_id" integer NOT NULL,
	"location_id" integer,
	"asset_id" integer,
	"priority" "wo_priority" DEFAULT 'medium' NOT NULL,
	"category" text,
	"requested_completion_date" date,
	"status" "request_status" DEFAULT 'submitted' NOT NULL,
	"decline_reason" text,
	"converted_work_order_id" integer,
	"origin_work_order_id" integer,
	"source" "request_source" DEFAULT 'internal' NOT NULL,
	"decided_by" integer,
	"decided_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "work_requests_request_number_unique" UNIQUE("request_number")
);
--> statement-breakpoint
ALTER TABLE "attachments" ALTER COLUMN "uploaded_by" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "sites" ADD COLUMN "portal_token" text;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_requests" ADD CONSTRAINT "work_requests_requester_id_users_id_fk" FOREIGN KEY ("requester_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_requests" ADD CONSTRAINT "work_requests_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_requests" ADD CONSTRAINT "work_requests_location_id_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_requests" ADD CONSTRAINT "work_requests_asset_id_assets_id_fk" FOREIGN KEY ("asset_id") REFERENCES "public"."assets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_requests" ADD CONSTRAINT "work_requests_converted_work_order_id_work_orders_id_fk" FOREIGN KEY ("converted_work_order_id") REFERENCES "public"."work_orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_requests" ADD CONSTRAINT "work_requests_origin_work_order_id_work_orders_id_fk" FOREIGN KEY ("origin_work_order_id") REFERENCES "public"."work_orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_requests" ADD CONSTRAINT "work_requests_decided_by_users_id_fk" FOREIGN KEY ("decided_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "notifications_user_idx" ON "notifications" USING btree ("user_id","is_read");--> statement-breakpoint
CREATE INDEX "requests_status_idx" ON "work_requests" USING btree ("status");--> statement-breakpoint
CREATE INDEX "requests_site_idx" ON "work_requests" USING btree ("site_id");--> statement-breakpoint
CREATE INDEX "requests_requester_idx" ON "work_requests" USING btree ("requester_id");--> statement-breakpoint
CREATE UNIQUE INDEX "requests_converted_wo_uq" ON "work_requests" USING btree ("converted_work_order_id") WHERE "work_requests"."converted_work_order_id" IS NOT NULL;--> statement-breakpoint
ALTER TABLE "sites" ADD CONSTRAINT "sites_portal_token_unique" UNIQUE("portal_token");