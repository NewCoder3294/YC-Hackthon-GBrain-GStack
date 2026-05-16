-- Enable RLS
ALTER TABLE cameras ENABLE ROW LEVEL SECURITY;
ALTER TABLE incidents ENABLE ROW LEVEL SECURITY;
ALTER TABLE clips ENABLE ROW LEVEL SECURITY;
ALTER TABLE clip_tags ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_camera_pins ENABLE ROW LEVEL SECURITY;

-- Cameras: any authenticated user can read; only service role writes.
CREATE POLICY "cameras_read_authenticated" ON cameras
  FOR SELECT TO authenticated USING (true);

-- Incidents: any authenticated user reads + writes.
CREATE POLICY "incidents_read_authenticated" ON incidents
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "incidents_insert_authenticated" ON incidents
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = created_by);
CREATE POLICY "incidents_update_owner" ON incidents
  FOR UPDATE TO authenticated USING (auth.uid() = created_by);
CREATE POLICY "incidents_delete_owner" ON incidents
  FOR DELETE TO authenticated USING (auth.uid() = created_by);

-- Clips: any authenticated user reads + writes.
CREATE POLICY "clips_read_authenticated" ON clips
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "clips_insert_authenticated" ON clips
  FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "clips_update_authenticated" ON clips
  FOR UPDATE TO authenticated USING (true);

-- Clip tags: read public, write by any authenticated user.
CREATE POLICY "clip_tags_read_authenticated" ON clip_tags
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "clip_tags_write_authenticated" ON clip_tags
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- User pins: per-user isolation.
CREATE POLICY "pins_read_own" ON user_camera_pins
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "pins_write_own" ON user_camera_pins
  FOR ALL TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
