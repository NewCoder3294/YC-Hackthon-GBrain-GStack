-- Email-first waitlist for business / shop owners interested in
-- contributing their CCTV. Lighter than `contributors` (no phone, no
-- camera enrollment); a row here represents intent, not enrollment.
CREATE TABLE IF NOT EXISTS contributor_waitlist (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email         text NOT NULL,
  business_name text,
  address       text,
  contact_name  text,
  camera_type   text,
  message       text,
  status        text NOT NULL DEFAULT 'pending',
  source_ip     text,
  user_agent    text,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS contributor_waitlist_created_at_idx
  ON contributor_waitlist (created_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS contributor_waitlist_email_unique
  ON contributor_waitlist (lower(email));

ALTER TABLE contributor_waitlist ENABLE ROW LEVEL SECURITY;

-- No client reads/writes. All inserts go through the service-role
-- API route (which also enforces rate limiting + validation). The
-- dashboard reads via service role as well.
CREATE POLICY "contributor_waitlist_no_client_access"
  ON contributor_waitlist
  FOR ALL TO authenticated, anon
  USING (false) WITH CHECK (false);
