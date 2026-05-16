-- When a clip from a contributor's camera lands on an incident, enqueue an
-- SMS notification for that contributor. The unique constraint on
-- (contributor_id, incident_id) keeps a given contributor from being
-- spammed by the same incident across multiple clips.
CREATE OR REPLACE FUNCTION enqueue_contributor_notification_for_clip()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_contributor_id uuid;
  v_contributor_phone text;
  v_contributor_token text;
  v_camera_name text;
  v_incident_title text;
  v_incident_created timestamptz;
BEGIN
  IF NEW.incident_id IS NULL OR NEW.camera_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT cam.contributor_id, ctr.contact_phone, ctr.token, cam.description
    INTO v_contributor_id, v_contributor_phone, v_contributor_token, v_camera_name
  FROM cameras cam
  JOIN contributors ctr ON ctr.id = cam.contributor_id
  WHERE cam.id = NEW.camera_id
    AND cam.contributor_id IS NOT NULL
    AND ctr.verified_at IS NOT NULL
    AND ctr.removed_at IS NULL;

  IF v_contributor_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT title, created_at
    INTO v_incident_title, v_incident_created
  FROM incidents
  WHERE id = NEW.incident_id;

  INSERT INTO contributor_notifications (contributor_id, incident_id, channel, body)
  VALUES (
    v_contributor_id,
    NEW.incident_id,
    'sms',
    'WatchDog detected ' || COALESCE(v_incident_title, 'an incident')
      || ' near your camera ' || COALESCE(v_camera_name, 'a registered camera')
      || ' at ' || to_char(COALESCE(v_incident_created, NEW.created_at), 'HH24:MI')
      || '. SFPD notified. Track: /c/' || v_contributor_token || '/i/' || NEW.incident_id
  )
  ON CONFLICT (contributor_id, incident_id) DO NOTHING;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS contributor_notify_on_clip ON clips;
CREATE TRIGGER contributor_notify_on_clip
AFTER INSERT ON clips
FOR EACH ROW EXECUTE FUNCTION enqueue_contributor_notification_for_clip();
