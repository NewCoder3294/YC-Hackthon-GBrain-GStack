-- The decisions → gbrain_records trigger writes a derived 'reviewed_incident'
-- row that the system requires after every decision write. The existing
-- gbrain_records RLS policy only permits authenticated inserts where
-- kind='intel_note', so the trigger violates RLS when invoked by a user
-- session. Granting SECURITY DEFINER on the trigger function lets the
-- derived write proceed under the function owner's role — same pattern
-- request_camera_access uses in migration 0008.

ALTER FUNCTION trg_write_reviewed_incident() SECURITY DEFINER;
ALTER FUNCTION trg_write_reviewed_incident() SET search_path = public;
