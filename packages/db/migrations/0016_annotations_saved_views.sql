-- map_annotations + saved_map_views
--
-- map_annotations: an analyst pins a textual note at a (lat, lng) on
-- the map; visible to anyone authenticated. Auto-expire after the
-- caller-supplied expires_at; UI hides stale rows. Useful for shift
-- handoff ("CCTV at this corner down since 04:00").
--
-- saved_map_views: bookmark of a filter+map URL state for re-use.
-- Scoped per-owner; an analyst's saves are visible only to them.

CREATE TABLE IF NOT EXISTS "map_annotations" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "author_id" uuid NOT NULL,
  "lat" double precision NOT NULL,
  "lng" double precision NOT NULL,
  "body" text NOT NULL CHECK (length("body") BETWEEN 1 AND 500),
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "expires_at" timestamp with time zone
);

CREATE INDEX IF NOT EXISTS "map_annotations_created_at_idx"
  ON "map_annotations" ("created_at" DESC);
CREATE INDEX IF NOT EXISTS "map_annotations_lat_lng_idx"
  ON "map_annotations" ("lat", "lng");

ALTER TABLE "map_annotations" ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "map_annotations_read_authenticated"
    ON "map_annotations" FOR SELECT TO authenticated USING (true);
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE POLICY "map_annotations_write_authenticated"
    ON "map_annotations" FOR INSERT TO authenticated
    WITH CHECK (author_id = auth.uid());
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE POLICY "map_annotations_delete_own"
    ON "map_annotations" FOR DELETE TO authenticated
    USING (author_id = auth.uid());
EXCEPTION WHEN duplicate_object THEN null; END $$;


CREATE TABLE IF NOT EXISTS "saved_map_views" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "owner_id" uuid NOT NULL,
  "name" text NOT NULL CHECK (length("name") BETWEEN 1 AND 80),
  "query_string" text NOT NULL CHECK (length("query_string") <= 2000),
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "saved_map_views_owner_name_uniq" UNIQUE ("owner_id", "name")
);

CREATE INDEX IF NOT EXISTS "saved_map_views_owner_created_idx"
  ON "saved_map_views" ("owner_id", "created_at" DESC);

ALTER TABLE "saved_map_views" ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "saved_map_views_owner_select"
    ON "saved_map_views" FOR SELECT TO authenticated
    USING (owner_id = auth.uid());
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE POLICY "saved_map_views_owner_insert"
    ON "saved_map_views" FOR INSERT TO authenticated
    WITH CHECK (owner_id = auth.uid());
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE POLICY "saved_map_views_owner_delete"
    ON "saved_map_views" FOR DELETE TO authenticated
    USING (owner_id = auth.uid());
EXCEPTION WHEN duplicate_object THEN null; END $$;
