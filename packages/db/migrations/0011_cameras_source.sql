-- Make camera provenance explicit on the `cameras` table.
-- See docs/superpowers/specs/2026-05-18-sf-camera-catalog-design.md.

ALTER TABLE cameras
  ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'caltrans';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'cameras_source_check'
  ) THEN
    ALTER TABLE cameras
      ADD CONSTRAINT cameras_source_check
      CHECK (source IN ('caltrans','curated','sfmta','contributor','demo'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS cameras_source_idx ON cameras (source);

-- Backfill: anything with a contributor_id is a contributor cam; the
-- existing demo seed slugs are 'demo'; everything else stays 'caltrans'.
UPDATE cameras SET source = 'contributor' WHERE contributor_id IS NOT NULL AND source = 'caltrans';
UPDATE cameras SET source = 'demo' WHERE caltrans_id LIKE 'demo-%' AND source = 'caltrans';
