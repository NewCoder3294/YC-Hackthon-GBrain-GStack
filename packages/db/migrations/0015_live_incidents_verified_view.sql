-- Cross-source verification badge for live_incidents.
--
-- An incident is "verified" when at least one OTHER incident from a
-- DIFFERENT source landed within 200m and ±10 minutes. The math is
-- expensive when computed on demand against the full table, so we
-- materialize as a view that the Live Feed loader joins against;
-- the per-row check uses the haversine formula in pure SQL.
--
-- `corroborating_sources` is the count of distinct other-source rows
-- meeting the proximity rule (0 = unverified, 1 = single corroboration,
-- etc). The UI renders a ✓ badge when count >= 1.

CREATE OR REPLACE VIEW public.live_incidents_verification AS
WITH recent AS (
  -- Bound the cross-join window so the view stays cheap. 48h is plenty
  -- for the cockpit's 24h working window plus a hop of historical context.
  SELECT id, source, lat, lng, occurred_at
  FROM live_incidents
  WHERE occurred_at >= (now() - INTERVAL '48 hours')
    AND lat IS NOT NULL
    AND lng IS NOT NULL
)
SELECT
  a.id,
  COALESCE(COUNT(DISTINCT b.source), 0)::int AS corroborating_sources,
  COUNT(b.id)::int AS corroborating_signals
FROM recent a
LEFT JOIN recent b
  ON b.id <> a.id
  AND b.source <> a.source
  AND ABS(EXTRACT(EPOCH FROM (b.occurred_at - a.occurred_at))) <= 600
  AND (
    6371000 * acos(
      LEAST(1.0,
        COS(RADIANS(a.lat)) * COS(RADIANS(b.lat))
          * COS(RADIANS(b.lng) - RADIANS(a.lng))
        + SIN(RADIANS(a.lat)) * SIN(RADIANS(b.lat))
      )
    )
  ) <= 200
GROUP BY a.id;

GRANT SELECT ON public.live_incidents_verification TO authenticated, anon;
