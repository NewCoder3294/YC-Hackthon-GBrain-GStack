-- Caltrans wall reliability: static JPEGs are the display surface; HLS is
-- preserved separately for ffmpeg/worker consumers.

ALTER TABLE "cameras"
  ADD COLUMN IF NOT EXISTS "still_image_url" text;

DO $$
DECLARE
  constraint_row record;
BEGIN
  FOR constraint_row IN
    SELECT conname
    FROM pg_constraint
    WHERE conrelid = 'cameras'::regclass
      AND contype = 'c'
      AND pg_get_constraintdef(oid) LIKE '%validation_status%'
  LOOP
    EXECUTE format(
      'ALTER TABLE "cameras" DROP CONSTRAINT IF EXISTS %I',
      constraint_row.conname
    );
  END LOOP;
END $$;

ALTER TABLE "cameras"
  ADD CONSTRAINT "cameras_validation_status_check"
  CHECK (validation_status IN ('unchecked','ok','degraded','failed','stale'));

CREATE INDEX IF NOT EXISTS "idx_cameras_still_image_url"
  ON "cameras" ("still_image_url")
  WHERE "still_image_url" IS NOT NULL;
