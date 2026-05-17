CREATE TABLE IF NOT EXISTS "live_incidents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source" text NOT NULL,
	"source_uid" text NOT NULL,
	"kind" text NOT NULL,
	"title" text NOT NULL,
	"subtitle" text,
	"severity" text DEFAULT 'low' NOT NULL,
	"priority" text,
	"status" text,
	"lat" double precision,
	"lng" double precision,
	"geo_precision" text DEFAULT 'unknown' NOT NULL,
	"neighborhood" text,
	"address" text,
	"occurred_at" timestamp with time zone NOT NULL,
	"ingested_at" timestamp with time zone DEFAULT now() NOT NULL,
	"acknowledged_by" uuid,
	"acknowledged_at" timestamp with time zone,
	"dismissed_at" timestamp with time zone,
	"raw" jsonb,
	CONSTRAINT "live_incidents_source_source_uid_unique" UNIQUE ("source", "source_uid")
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_live_incidents_source_time" ON "live_incidents" ("source", "occurred_at" DESC);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_live_incidents_time" ON "live_incidents" ("occurred_at" DESC);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "live_incident_syncs" (
	"source" text PRIMARY KEY NOT NULL,
	"last_run_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_status" text DEFAULT 'ok' NOT NULL,
	"last_error" text,
	"rows_upserted" integer DEFAULT 0 NOT NULL,
	"last_high_water_mark" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "live_incidents" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "live_incident_syncs" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
DO $$ BEGIN
  CREATE POLICY "live_incidents_read_authenticated" ON "live_incidents"
    FOR SELECT TO authenticated USING (true);
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
DO $$ BEGIN
  CREATE POLICY "live_incidents_ack_authenticated" ON "live_incidents"
    FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
DO $$ BEGIN
  CREATE POLICY "live_incident_syncs_read_authenticated" ON "live_incident_syncs"
    FOR SELECT TO authenticated USING (true);
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
-- Opt the live_incidents table into the Supabase Realtime publication so
-- inserts/updates are streamed to subscribed clients. Without this the
-- realtime channel will connect but receive no events.
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE live_incidents;
EXCEPTION WHEN duplicate_object THEN null; END $$;
