-- Camera source remodel: ArcGIS owns inventory, surfaces own delivery URLs,
-- and product_status is derived from surface health.

ALTER TABLE "cameras"
  ADD COLUMN IF NOT EXISTS "product_status" text NOT NULL DEFAULT 'unchecked';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'cameras_product_status_check'
  ) THEN
    ALTER TABLE "cameras"
      ADD CONSTRAINT "cameras_product_status_check"
      CHECK (product_status IN ('unchecked','displayable','degraded','hidden'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "idx_cameras_product_status"
  ON "cameras" ("product_status");

CREATE TABLE IF NOT EXISTS "camera_surfaces" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "camera_id" uuid NOT NULL REFERENCES "cameras"("id") ON DELETE cascade,
  "kind" text NOT NULL CHECK (kind IN ('still','hls','iframe','rtsp')),
  "url" text NOT NULL,
  "provider" text NOT NULL,
  "provider_key" text NOT NULL,
  "priority" integer NOT NULL DEFAULT 100,
  "is_active" boolean NOT NULL DEFAULT true,
  "metadata" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "last_synced_at" timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS "camera_surfaces_provider_key_unique"
  ON "camera_surfaces" ("provider", "provider_key");

CREATE INDEX IF NOT EXISTS "idx_camera_surfaces_camera"
  ON "camera_surfaces" ("camera_id");

CREATE INDEX IF NOT EXISTS "idx_camera_surfaces_kind_active"
  ON "camera_surfaces" ("kind", "is_active");

CREATE TABLE IF NOT EXISTS "camera_surface_health" (
  "surface_id" uuid PRIMARY KEY REFERENCES "camera_surfaces"("id") ON DELETE cascade,
  "reachability_status" text NOT NULL DEFAULT 'unchecked'
    CHECK (reachability_status IN ('unchecked','ok','failed','stale')),
  "visual_status" text NOT NULL DEFAULT 'unchecked'
    CHECK (visual_status IN ('unchecked','ok','failed','not_applicable','stale')),
  "last_checked_at" timestamptz,
  "error" text,
  "sample_metadata" jsonb NOT NULL DEFAULT '{}'::jsonb
);

-- Backfill the surface model from legacy camera columns so deploying the
-- schema before the ArcGIS sync is non-disruptive.
INSERT INTO "camera_surfaces" (
  "camera_id",
  "kind",
  "url",
  "provider",
  "provider_key",
  "priority",
  "metadata",
  "last_synced_at"
)
SELECT
  c."id",
  'still',
  c."still_image_url",
  c."source",
  c."caltrans_id" || ':legacy:still',
  50,
  jsonb_build_object('backfill', true),
  now()
FROM "cameras" c
WHERE c."still_image_url" IS NOT NULL
ON CONFLICT ("provider", "provider_key") DO UPDATE SET
  "camera_id" = excluded."camera_id",
  "url" = excluded."url",
  "is_active" = true,
  "last_synced_at" = now();

INSERT INTO "camera_surfaces" (
  "camera_id",
  "kind",
  "url",
  "provider",
  "provider_key",
  "priority",
  "metadata",
  "last_synced_at"
)
SELECT
  c."id",
  'hls',
  COALESCE(c."provider_metadata"->>'hlsUrl', c."provider_metadata"->>'hls_url', c."stream_url"),
  c."source",
  c."caltrans_id" || ':legacy:hls',
  60,
  jsonb_build_object('backfill', true),
  now()
FROM "cameras" c
WHERE
  COALESCE(c."provider_metadata"->>'hlsUrl', c."provider_metadata"->>'hls_url', c."stream_url") LIKE '%.m3u8%'
ON CONFLICT ("provider", "provider_key") DO UPDATE SET
  "camera_id" = excluded."camera_id",
  "url" = excluded."url",
  "is_active" = true,
  "last_synced_at" = now();
