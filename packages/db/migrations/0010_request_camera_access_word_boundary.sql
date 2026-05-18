-- Tighten blocked_incident_types matching: substring match on title meant
-- "fight" would block "firefighter rescue". Switch to a word-boundary
-- regex against the incident title. Same arg list as 0008; this is a
-- CREATE OR REPLACE.

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

      -- Blocked incident types: word-boundary regex match against the
      -- incident title. "fight" matches "Fight detection" but not
      -- "firefighter rescue". Case-insensitive.
      IF p_incident_id IS NOT NULL
         AND coalesce(array_length(v_pol.blocked_incident_types, 1), 0) > 0 THEN
        SELECT lower(title) INTO v_inc_title FROM incidents WHERE id = p_incident_id;
        IF v_inc_title IS NOT NULL AND EXISTS (
          SELECT 1 FROM unnest(v_pol.blocked_incident_types) AS kw
          WHERE v_inc_title ~* ('\m' || regexp_replace(lower(kw), '([\\.\\^\\$\\*\\+\\?\\(\\)\\[\\]\\{\\}\\|])', '\\\\\\1', 'g') || '\M')
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
