ALTER TABLE contributors ENABLE ROW LEVEL SECURITY;
ALTER TABLE contributor_notifications ENABLE ROW LEVEL SECURITY;

-- contributors: no client access. All reads go through service role on the server.
CREATE POLICY "contributors_no_client_access" ON contributors
  FOR ALL TO authenticated USING (false) WITH CHECK (false);

-- contributor_notifications: same.
CREATE POLICY "contributor_notifications_no_client_access" ON contributor_notifications
  FOR ALL TO authenticated USING (false) WITH CHECK (false);
