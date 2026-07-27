CREATE TABLE "procedure_responses" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "procedure_responses_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"instance_id" integer NOT NULL,
	"step_index" integer NOT NULL,
	"value" jsonb NOT NULL,
	"is_failure" boolean DEFAULT false NOT NULL,
	"responded_by" integer NOT NULL,
	"responded_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "procedure_templates" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "procedure_templates_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"name" text NOT NULL,
	"description" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"current_version" integer DEFAULT 0 NOT NULL,
	"created_by" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "procedure_versions" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "procedure_versions_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"template_id" integer NOT NULL,
	"version" integer NOT NULL,
	"steps" jsonb NOT NULL,
	"created_by" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "wo_procedure_instances" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "wo_procedure_instances_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"work_order_id" integer NOT NULL,
	"template_id" integer,
	"template_version" integer,
	"name" text NOT NULL,
	"steps_snapshot" jsonb NOT NULL,
	"attached_by" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "work_orders" ADD COLUMN "flagged" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "procedure_responses" ADD CONSTRAINT "procedure_responses_instance_id_wo_procedure_instances_id_fk" FOREIGN KEY ("instance_id") REFERENCES "public"."wo_procedure_instances"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "procedure_responses" ADD CONSTRAINT "procedure_responses_responded_by_users_id_fk" FOREIGN KEY ("responded_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "procedure_templates" ADD CONSTRAINT "procedure_templates_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "procedure_versions" ADD CONSTRAINT "procedure_versions_template_id_procedure_templates_id_fk" FOREIGN KEY ("template_id") REFERENCES "public"."procedure_templates"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "procedure_versions" ADD CONSTRAINT "procedure_versions_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wo_procedure_instances" ADD CONSTRAINT "wo_procedure_instances_work_order_id_work_orders_id_fk" FOREIGN KEY ("work_order_id") REFERENCES "public"."work_orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wo_procedure_instances" ADD CONSTRAINT "wo_procedure_instances_template_id_procedure_templates_id_fk" FOREIGN KEY ("template_id") REFERENCES "public"."procedure_templates"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wo_procedure_instances" ADD CONSTRAINT "wo_procedure_instances_attached_by_users_id_fk" FOREIGN KEY ("attached_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "procedure_responses_uq" ON "procedure_responses" USING btree ("instance_id","step_index");--> statement-breakpoint
CREATE UNIQUE INDEX "procedure_versions_uq" ON "procedure_versions" USING btree ("template_id","version");--> statement-breakpoint
CREATE INDEX "wo_proc_wo_idx" ON "wo_procedure_instances" USING btree ("work_order_id");