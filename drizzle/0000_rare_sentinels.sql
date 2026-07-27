CREATE TABLE "org_settings" (
	"id" smallint PRIMARY KEY DEFAULT 1 NOT NULL,
	"name" text DEFAULT 'Maintenance Manager' NOT NULL,
	"timezone" text DEFAULT 'UTC' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "org_settings_singleton" CHECK ("org_settings"."id" = 1)
);
