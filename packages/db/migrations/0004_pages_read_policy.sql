-- pages: authenticated SELECT policy so server components (KG, /enrichment)
-- can read the rows the websearch / enrichment pipeline writes via the
-- service role. Writes continue to bypass RLS via SUPABASE_SERVICE_ROLE_KEY.
-- Applied like 0001_rls.sql (run directly via Supabase SQL editor / psql;
-- not in the drizzle journal, matching this repo's existing convention).
-- Idempotent so it is safe to re-run.

DO $$ BEGIN
  CREATE POLICY "pages_read_authenticated" ON "pages"
    FOR SELECT TO authenticated USING (true);
EXCEPTION WHEN duplicate_object THEN null; END $$;
