-- Cameras can come from multiple providers (caltrans, curated, windy,
-- contributor, sfmta-future). The provider_metadata jsonb holds per-
-- provider opaque state — Windy's webcamId, EarthCam's stream key, etc.
-- Keeps `cameras` table schema stable while letting each source store
-- whatever it needs for proxy resolution / token refresh / linkback.

ALTER TABLE cameras
  ADD COLUMN IF NOT EXISTS provider_metadata jsonb NOT NULL DEFAULT '{}'::jsonb;

-- Allow 'windy' alongside the existing source enum values.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'cameras_source_check'
  ) THEN
    ALTER TABLE cameras DROP CONSTRAINT cameras_source_check;
  END IF;
  ALTER TABLE cameras
    ADD CONSTRAINT cameras_source_check
    CHECK (source IN ('caltrans','curated','sfmta','windy','contributor','demo'));
END $$;
