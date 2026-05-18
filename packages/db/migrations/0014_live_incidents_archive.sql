-- live_incidents retention — rows older than 90 days move to an archive
-- table on a nightly cron. Same shape as the hot table so queries can
-- UNION ALL across both for long-window analysis if ever needed.

CREATE TABLE IF NOT EXISTS "live_incidents_archive" (
  "id" uuid PRIMARY KEY NOT NULL,
  "source" text NOT NULL,
  "source_uid" text NOT NULL,
  "kind" text NOT NULL,
  "title" text NOT NULL,
  "subtitle" text,
  "severity" text NOT NULL,
  "priority" text,
  "status" text,
  "lat" double precision,
  "lng" double precision,
  "geo_precision" text NOT NULL,
  "neighborhood" text,
  "address" text,
  "occurred_at" timestamp with time zone NOT NULL,
  "ingested_at" timestamp with time zone NOT NULL,
  "acknowledged_by" uuid,
  "acknowledged_at" timestamp with time zone,
  "dismissed_at" timestamp with time zone,
  "raw" jsonb,
  "archived_at" timestamp with time zone NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "live_incidents_archive_occurred_at_idx"
  ON "live_incidents_archive" ("occurred_at" DESC);

CREATE UNIQUE INDEX IF NOT EXISTS "live_incidents_archive_source_uid_uniq"
  ON "live_incidents_archive" ("source", "source_uid");

ALTER TABLE "live_incidents_archive" ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "live_incidents_archive_read_authenticated"
    ON "live_incidents_archive" FOR SELECT TO authenticated USING (true);
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- SECURITY DEFINER so a cron caller without write privileges on the
-- archive table can still trigger the move. Uses set_config('search_path')
-- to harden against schema-shadow attacks.
CREATE OR REPLACE FUNCTION public.archive_live_incidents(
  older_than_days integer DEFAULT 90,
  max_rows integer DEFAULT 5000
)
RETURNS TABLE(moved integer, oldest timestamp with time zone)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  moved_count integer := 0;
  oldest_kept timestamp with time zone;
BEGIN
  WITH due AS (
    SELECT * FROM live_incidents
    WHERE occurred_at < (now() - make_interval(days => older_than_days))
    ORDER BY occurred_at ASC
    LIMIT max_rows
  ),
  inserted AS (
    INSERT INTO live_incidents_archive (
      id, source, source_uid, kind, title, subtitle, severity,
      priority, status, lat, lng, geo_precision, neighborhood, address,
      occurred_at, ingested_at, acknowledged_by, acknowledged_at,
      dismissed_at, raw
    )
    SELECT
      id, source, source_uid, kind, title, subtitle, severity,
      priority, status, lat, lng, geo_precision, neighborhood, address,
      occurred_at, ingested_at, acknowledged_by, acknowledged_at,
      dismissed_at, raw
    FROM due
    ON CONFLICT (source, source_uid) DO NOTHING
    RETURNING id
  ),
  deleted AS (
    DELETE FROM live_incidents
    WHERE id IN (SELECT id FROM due)
    RETURNING id
  )
  SELECT COUNT(*) INTO moved_count FROM deleted;

  SELECT MIN(occurred_at) INTO oldest_kept FROM live_incidents;

  RETURN QUERY SELECT moved_count, oldest_kept;
END;
$$;

REVOKE ALL ON FUNCTION public.archive_live_incidents(integer, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.archive_live_incidents(integer, integer)
  TO authenticated, service_role;
