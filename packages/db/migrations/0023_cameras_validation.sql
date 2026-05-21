-- Phase 8: backend validation of camera streams. /wall and /map only
-- surface cameras whose validation_status is 'ok' or 'unchecked'. The
-- /api/cron/validate-cameras route sweeps the population on a schedule
-- and writes the result here.

ALTER TABLE "cameras"
  ADD COLUMN IF NOT EXISTS "validation_status" text NOT NULL DEFAULT 'unchecked'
    CHECK (validation_status IN ('unchecked','ok','failed','stale')),
  ADD COLUMN IF NOT EXISTS "last_validated_at" timestamptz,
  ADD COLUMN IF NOT EXISTS "validation_error" text;

CREATE INDEX IF NOT EXISTS "idx_cameras_validation_status"
  ON "cameras" ("validation_status");

CREATE INDEX IF NOT EXISTS "idx_cameras_validate_priority"
  ON "cameras" ("last_validated_at" NULLS FIRST)
  WHERE is_active = true;
