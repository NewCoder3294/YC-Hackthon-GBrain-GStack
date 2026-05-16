CREATE TABLE IF NOT EXISTS "contributor_notifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"contributor_id" uuid NOT NULL,
	"incident_id" uuid NOT NULL,
	"channel" text NOT NULL,
	"body" text NOT NULL,
	"status" text DEFAULT 'queued' NOT NULL,
	"sent_at" timestamp with time zone,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "contributors" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"contact_phone" text NOT NULL,
	"contact_email" text,
	"token" text NOT NULL,
	"verification_code" text,
	"verification_expires_at" timestamp with time zone,
	"verified_at" timestamp with time zone,
	"hours_json" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"removed_at" timestamp with time zone,
	CONSTRAINT "contributors_contact_phone_unique" UNIQUE("contact_phone"),
	CONSTRAINT "contributors_token_unique" UNIQUE("token")
);
--> statement-breakpoint
ALTER TABLE "cameras" ADD COLUMN "contributor_id" uuid;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "contributor_notifications" ADD CONSTRAINT "contributor_notifications_contributor_id_contributors_id_fk" FOREIGN KEY ("contributor_id") REFERENCES "public"."contributors"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "contributor_notifications" ADD CONSTRAINT "contributor_notifications_incident_id_incidents_id_fk" FOREIGN KEY ("incident_id") REFERENCES "public"."incidents"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "contributor_notifications_unique_per_incident" ON "contributor_notifications" USING btree ("contributor_id","incident_id");--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "cameras" ADD CONSTRAINT "cameras_contributor_id_contributors_id_fk" FOREIGN KEY ("contributor_id") REFERENCES "public"."contributors"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
