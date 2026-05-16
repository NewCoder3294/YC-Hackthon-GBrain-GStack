-- signal_events: shared Layer-1 ingestion substrate (TRD §3.1).
-- Applied like 0001_rls.sql (run directly via Supabase SQL editor / psql;
-- not in the drizzle journal, matching this repo's existing convention).
-- Idempotent so it is safe to re-run.

CREATE TABLE IF NOT EXISTS "signal_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source_type" text NOT NULL,
	"source_id" text NOT NULL,
	"occurred_at" timestamp with time zone NOT NULL,
	"ingested_at" timestamp with time zone DEFAULT now() NOT NULL,
	"lat" double precision NOT NULL,
	"lng" double precision NOT NULL,
	"payload" jsonb NOT NULL,
	"confidence" real,
	"raw_clip_uri" text,
	CONSTRAINT "signal_events_source_type_check" CHECK (
		"source_type" IN ('camera_public', 'camera_private', 'call_911', 'citizen_report')
	)
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "signal_events_occurred_at_idx"
	ON "signal_events" ("occurred_at" DESC);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "signal_events_source_type_idx"
	ON "signal_events" ("source_type");
--> statement-breakpoint
-- Operator dashboard reads signal_events; only the service role writes.
ALTER TABLE "signal_events" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
DO $$ BEGIN
	CREATE POLICY "signal_events_read_authenticated" ON "signal_events"
		FOR SELECT TO authenticated USING (true);
EXCEPTION
	WHEN duplicate_object THEN null;
END $$;
