-- news_incidents — geo-tagged SF violent crime news feed for the map.
-- Additive only. No changes to existing tables. Follows the
-- 0004_pages_read_policy convention: idempotent, safe to re-run,
-- and applied directly via the Supabase SQL editor / psql.

CREATE TABLE IF NOT EXISTS "news_incidents" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "source" text NOT NULL,
  "source_url" text,
  "title" text NOT NULL,
  "summary" text,
  "crime_type" text NOT NULL,
  "severity" text NOT NULL DEFAULT 'med',
  "neighborhood" text,
  "address" text,
  "lat" double precision NOT NULL,
  "lng" double precision NOT NULL,
  "published_at" timestamp with time zone NOT NULL,
  "ingested_at" timestamp with time zone NOT NULL DEFAULT now(),
  "raw" jsonb,
  CONSTRAINT "news_incidents_severity_check"
    CHECK ("severity" IN ('low', 'med', 'high'))
);

CREATE INDEX IF NOT EXISTS "news_incidents_published_at_idx"
  ON "news_incidents" ("published_at" DESC);

CREATE INDEX IF NOT EXISTS "news_incidents_crime_type_idx"
  ON "news_incidents" ("crime_type");

CREATE UNIQUE INDEX IF NOT EXISTS "news_incidents_source_url_uniq_idx"
  ON "news_incidents" ("source_url")
  WHERE "source_url" IS NOT NULL;

ALTER TABLE "news_incidents" ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "news_incidents_read_authenticated" ON "news_incidents"
    FOR SELECT TO authenticated USING (true);
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE POLICY "news_incidents_read_anon" ON "news_incidents"
    FOR SELECT TO anon USING (true);
EXCEPTION WHEN duplicate_object THEN null; END $$;
