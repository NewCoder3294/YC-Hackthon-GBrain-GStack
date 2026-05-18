-- 0008_camera_policies.sql
-- Policy-as-code enforcement: per-camera homeowner policies + the
-- append-only audit log every request writes. The request_camera_access
-- function below is the single enforcement point — UI, server actions,
-- and any future worker all route through it. See
-- docs/superpowers/specs/2026-05-18-policy-enforcer-blockers-design.md.

CREATE TABLE IF NOT EXISTS "camera_policies" (
  "camera_id"              uuid PRIMARY KEY REFERENCES "cameras"("id") ON DELETE CASCADE,
  "geofence_radius_m"      int NOT NULL CHECK ("geofence_radius_m" BETWEEN 50 AND 5000),
  "window_start_local"     text CHECK ("window_start_local" ~ '^\d{2}:\d{2}$'),
  "window_end_local"       text CHECK ("window_end_local"   ~ '^\d{2}:\d{2}$'),
  "warrant_required"       boolean NOT NULL DEFAULT false,
  "exigent_allowed"        boolean NOT NULL DEFAULT true,
  "blocked_incident_types" text[]  NOT NULL DEFAULT '{}',
  "updated_at"             timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "camera_access_events" (
  "id"              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "camera_id"       uuid NOT NULL REFERENCES "cameras"("id") ON DELETE CASCADE,
  "contributor_id"  uuid          REFERENCES "contributors"("id") ON DELETE SET NULL,
  "incident_id"     uuid          REFERENCES "incidents"("id")    ON DELETE SET NULL,
  "accessed_by"     text NOT NULL,
  "legal_basis"     text NOT NULL DEFAULT 'standing_consent',
  "reason"          text,
  "allowed"         boolean NOT NULL DEFAULT true,
  "denial_reason"   text,
  "policy_snapshot" jsonb,
  "occurred_at"     timestamptz NOT NULL DEFAULT now()
);
-- Bring pre-existing tables up to the spec shape.
ALTER TABLE "camera_access_events"
  ADD COLUMN IF NOT EXISTS "allowed"         boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS "denial_reason"   text,
  ADD COLUMN IF NOT EXISTS "policy_snapshot" jsonb;

-- Make legal_basis CHECK reflect the four allowed bases, replacing whatever
-- (or nothing) is there today.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'camera_access_events_legal_basis_check'
  ) THEN
    ALTER TABLE "camera_access_events" DROP CONSTRAINT "camera_access_events_legal_basis_check";
  END IF;
  ALTER TABLE "camera_access_events"
    ADD CONSTRAINT "camera_access_events_legal_basis_check"
    CHECK ("legal_basis" IN ('standing_consent','exigent','warrant','public_domain'));
END $$;

CREATE INDEX IF NOT EXISTS "camera_access_events_camera_time_idx"
  ON "camera_access_events" ("camera_id", "occurred_at" DESC);
CREATE INDEX IF NOT EXISTS "camera_access_events_incident_idx"
  ON "camera_access_events" ("incident_id") WHERE "incident_id" IS NOT NULL;

ALTER TABLE "camera_policies"      ENABLE ROW LEVEL SECURITY;
ALTER TABLE "camera_access_events" ENABLE ROW LEVEL SECURITY;

-- Service role bypasses RLS; deny by default for anon and authenticated.
-- The /c/[token] audit view goes through the admin client server-side
-- (existing pattern) and only sees rows for cameras owned by the token's
-- contributor, so no permissive policy is required today.

-- Realtime so the citizen audit table redraws on insert.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'camera_access_events'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE "camera_access_events";
  END IF;
END $$;

CREATE OR REPLACE FUNCTION time_in_window(t time, w_start time, w_end time)
RETURNS boolean LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE
    WHEN w_start <= w_end THEN t BETWEEN w_start AND w_end
    ELSE t >= w_start OR t <= w_end
  END
$$;

CREATE OR REPLACE FUNCTION request_camera_access(
  p_camera_id   uuid,
  p_incident_id uuid,
  p_accessed_by text,
  p_legal_basis text,
  p_reason      text,
  p_has_warrant boolean DEFAULT false,
  p_is_exigent  boolean DEFAULT false
) RETURNS TABLE (
  event_id        uuid,
  allowed         boolean,
  denial_reason   text,
  policy_snapshot jsonb
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_pol         camera_policies%ROWTYPE;
  v_contrib_id  uuid;
  v_inc_title   text;
  v_local_now   time;
  v_allowed     boolean := true;
  v_denial      text;
  v_snapshot    jsonb;
  v_basis       text := p_legal_basis;
BEGIN
  SELECT contributor_id INTO v_contrib_id FROM cameras WHERE id = p_camera_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'camera_not_found' USING ERRCODE = 'P0002';
  END IF;

  IF v_contrib_id IS NULL THEN
    v_basis := 'public_domain';
  ELSE
    SELECT * INTO v_pol FROM camera_policies WHERE camera_id = p_camera_id;
    IF FOUND THEN
      v_snapshot := to_jsonb(v_pol);

      IF p_incident_id IS NOT NULL
         AND array_length(v_pol.blocked_incident_types, 1) > 0 THEN
        SELECT lower(title) INTO v_inc_title FROM incidents WHERE id = p_incident_id;
        IF v_inc_title IS NOT NULL AND EXISTS (
          SELECT 1 FROM unnest(v_pol.blocked_incident_types) AS kw
          WHERE v_inc_title LIKE '%' || lower(kw) || '%'
        ) THEN
          v_allowed := false;
          v_denial  := 'blocked_incident_type';
        END IF;
      END IF;

      IF v_allowed AND v_pol.warrant_required AND NOT p_has_warrant
         AND NOT (v_pol.exigent_allowed AND p_is_exigent) THEN
        v_allowed := false;
        v_denial  := 'warrant_required';
      END IF;

      IF v_allowed AND v_pol.window_start_local IS NOT NULL THEN
        v_local_now := (now() AT TIME ZONE 'America/Los_Angeles')::time;
        IF NOT time_in_window(v_local_now,
                              v_pol.window_start_local::time,
                              v_pol.window_end_local::time) THEN
          v_allowed := false;
          v_denial  := 'outside_time_window';
        END IF;
      END IF;
    END IF;
  END IF;

  INSERT INTO camera_access_events
    (camera_id, contributor_id, incident_id, accessed_by, legal_basis,
     reason, allowed, denial_reason, policy_snapshot)
  VALUES
    (p_camera_id, v_contrib_id, p_incident_id, p_accessed_by, v_basis,
     p_reason, v_allowed, v_denial, v_snapshot)
  RETURNING id INTO event_id;

  allowed := v_allowed;
  denial_reason := v_denial;
  policy_snapshot := v_snapshot;
  RETURN NEXT;
END $$;

GRANT EXECUTE ON FUNCTION request_camera_access TO service_role;
GRANT EXECUTE ON FUNCTION time_in_window        TO service_role;
