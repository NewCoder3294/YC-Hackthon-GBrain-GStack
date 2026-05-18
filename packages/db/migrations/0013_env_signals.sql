-- env_signals — single-table multi-kind environmental & sensor layer.
--
-- Mirrors the `live_incidents` pattern: one table, six (or more) `kind`
-- discriminators, shared geo + severity + raw jsonb shape. Each source
-- (NWS weather, PurpleAir AQI, USGS quakes, ADS-B aircraft, AIS marine,
-- BART/MTA transit) writes rows with its own `source` + `source_uid`
-- and the rendering layer dispatches on `kind`.
--
-- `kind` is a check-constrained text column rather than a Postgres enum
-- so future sources (e.g. tide, lightning, satellite passes) can be
-- added without a schema migration to the enum.

CREATE TABLE IF NOT EXISTS "env_signals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"kind" text NOT NULL,
	"source" text NOT NULL,
	"source_uid" text NOT NULL,
	"lat" double precision,
	"lng" double precision,
	"severity" text DEFAULT 'low' NOT NULL,
	"title" text NOT NULL,
	"subtitle" text,
	"occurred_at" timestamp with time zone NOT NULL,
	"expires_at" timestamp with time zone,
	"ingested_at" timestamp with time zone DEFAULT now() NOT NULL,
	"raw" jsonb,
	CONSTRAINT "env_signals_kind_check" CHECK ("kind" IN ('weather','aqi','quake','aircraft','vessel','transit')),
	CONSTRAINT "env_signals_severity_check" CHECK ("severity" IN ('low','med','high')),
	CONSTRAINT "env_signals_source_source_uid_unique" UNIQUE ("source","source_uid")
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_env_signals_kind_time" ON "env_signals" ("kind", "occurred_at" DESC);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_env_signals_active" ON "env_signals" ("occurred_at" DESC)
	WHERE "expires_at" IS NULL OR "expires_at" > now();
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_env_signals_source" ON "env_signals" ("source");
--> statement-breakpoint
ALTER TABLE "env_signals" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
DO $$ BEGIN
  CREATE POLICY "env_signals_read_authenticated" ON "env_signals"
    FOR SELECT TO authenticated USING (true);
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
DO $$ BEGIN
  CREATE POLICY "env_signals_read_anon" ON "env_signals"
    FOR SELECT TO anon USING (true);
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
-- Opt into Supabase Realtime so subscribers see env updates as they're
-- ingested. Cheap — env cron only runs every 5 min.
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE env_signals;
EXCEPTION WHEN duplicate_object THEN null; END $$;
