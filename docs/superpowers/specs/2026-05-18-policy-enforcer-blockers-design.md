# Policy enforcer + decision wiring — design

**Date:** 2026-05-18
**Branch:** `feat/policy-enforcer-blockers`
**Goal:** Close the three blockers that prevent the DEMO_SCRIPT round-trip
("dispatcher Holds → GBrain learns → citizen sees denied access") from
running end-to-end.

This is Spec A. Spec B (SF camera coverage expansion — hand-curated catalog
plus SFMTA / 511 scraper, public-cam category) is intentionally split out and
will be planned separately. Both can land in parallel; this spec assumes
nothing from Spec B beyond what already exists in the `cameras` table today.

## Scope

In:
1. `camera_policies` + `camera_access_events` tables + RLS.
2. `request_camera_access` SQL function (the policy-as-code enforcer).
3. Wiring the existing `DecisionPanel` into `/incidents/[id]` and fanning a
   "hold" decision out to incident-linked cameras through the enforcer.
4. New `POST /api/incidents/[id]/request-camera-access` (and the analogous
   `/api/cameras/[id]/request-access`) — thin wrappers over the RPC.
5. New per-camera `CameraAccessRow` component on the incident detail page
   and a "Request footage" button on `/live/[id]`.
6. Idempotent demo seed script.
7. Vitest unit + integration coverage + a Playwright end-to-end run of the
   demo script.

Out:
- Extending the camera catalog beyond five hand-picked public webcams.
  Spec B owns that.
- Geofence radius enforcement. The column exists on `camera_policies` and
  the RPC reads it into `policy_snapshot`, but no eval path uses it yet —
  a camera request is for the *camera's own* footage, not a polygon query.
  Spec B will use the radius column when querying *which cameras* fall near
  an incident.
- Live HLS clip serving with the access event ID embedded. The audit row
  carries the event id; wiring the player to show "access granted by event
  X" is polish for after the demo.

## Architecture

Three new artifacts plus one rewire, all inside `~/caltrans-cctv`:

```
packages/db/migrations/
  0008_camera_policies.sql                NEW — tables, RLS, request_camera_access RPC
packages/db/src/schema.ts                 EDIT — add cameraPolicies, cameraAccessEvents
apps/web/app/api/incidents/[id]/
  request-camera-access/route.ts          NEW — POST wrapper
apps/web/app/api/cameras/[id]/
  request-access/route.ts                 NEW — POST wrapper (no incident context)
apps/web/app/(app)/kg/actions.ts          EDIT — recordDecision('hold') fans out
apps/web/app/(app)/incidents/[id]/
  page.tsx                                EDIT — render <DecisionPanel/> + cameras-on-scene
  camera-access-row.tsx                   NEW — per-camera client component
apps/web/app/(app)/live/[id]/
  request-access-button.tsx               NEW — client component
scripts/seed-demo.ts                      NEW — idempotent demo seed
```

The RPC is the **single enforcement choke point**. UI, server actions, and
any future worker all call it. No TypeScript-side policy logic — keeps the
"policy as literal SQL the homeowner could audit" framing honest.

### Data flow — demo arc

```
Dispatcher clicks Hold on /incidents/[id]
  → recordDecision() writes decisions row + GBrain reviewed_incident page
  → for each unique camera in signal_events.where(incident_id):
      → request_camera_access RPC evaluates camera_policies
      → writes camera_access_events row (allowed = true|false)
  → Supabase realtime postgres_changes refreshes the citizen audit table.

Citizen tightens warrant_required=true on /c/[token]
  → POST /api/contribute/policy upserts camera_policies (already wired today).

Dispatcher clicks "Request footage" on /live/[id] or in the incident sidebar
  → POST /api/incidents/[id]/request-camera-access
  → same RPC → now denies (warrant_required && !p_has_warrant)
  → audit_event row visible to citizen with denial_reason = 'warrant_required'.
```

## Schema — `0008_camera_policies.sql`

```sql
-- camera_policies: one row per camera with an opted-in homeowner.
-- Cameras with no contributor have no row → RPC treats as public_domain.
CREATE TABLE camera_policies (
  camera_id              uuid PRIMARY KEY REFERENCES cameras(id) ON DELETE CASCADE,
  geofence_radius_m      int  NOT NULL CHECK (geofence_radius_m BETWEEN 50 AND 5000),
  window_start_local     text CHECK (window_start_local ~ '^\d{2}:\d{2}$'),  -- nullable = always-on
  window_end_local       text CHECK (window_end_local   ~ '^\d{2}:\d{2}$'),
  warrant_required       boolean NOT NULL DEFAULT false,
  exigent_allowed        boolean NOT NULL DEFAULT true,
  blocked_incident_types text[]  NOT NULL DEFAULT '{}',
  updated_at             timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE camera_access_events (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  camera_id       uuid NOT NULL REFERENCES cameras(id) ON DELETE CASCADE,
  contributor_id  uuid          REFERENCES contributors(id) ON DELETE SET NULL,
  incident_id     uuid          REFERENCES incidents(id)    ON DELETE SET NULL,
  accessed_by     text NOT NULL,                   -- "dispatcher:<email>" | "contributor:<id>" | "system"
  legal_basis     text NOT NULL CHECK (legal_basis IN ('standing_consent','exigent','warrant','public_domain')),
  reason          text,
  allowed         boolean NOT NULL,
  denial_reason   text,
  policy_snapshot jsonb,                            -- frozen camera_policies row at decision time
  occurred_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON camera_access_events (camera_id, occurred_at DESC);
CREATE INDEX ON camera_access_events (incident_id) WHERE incident_id IS NOT NULL;
```

### RLS

- `camera_policies` — service-role full access. Contributor reads/writes go
  through the existing admin-client path in `/api/contribute/policy` (token
  ownership already verified there).
- `camera_access_events` — service-role inserts only (the RPC is
  `SECURITY DEFINER`). Contributor `SELECT` policy joins
  `cameras.contributor_id = current_contributor()` resolved from the
  contributor token; the existing `/c/[token]` audit table uses the admin
  client for reads server-side, so no end-user RLS path is needed today.
- Realtime publication: `ALTER PUBLICATION supabase_realtime ADD TABLE camera_access_events`.

### Design choices worth flagging

- **`allowed` + `denial_reason` columns** are explicit on the event row so
  the citizen audit table is self-describing — no policy join needed to
  interpret a denial. The DEMO_SCRIPT line "blocked by owner policy —
  warrant required" reads `denial_reason` verbatim.
- **`policy_snapshot jsonb`** is captured on every access against a
  contributor camera, even allows. Frozen at decision time so later edits
  don't rewrite forensic history. Covers the script line "the policy
  version that was active at the time."
- **`incident_id` is nullable** so contributor-driven access events (policy
  edits, owner self-reviews) and `/live/[id]` ad-hoc queries all fit.

## RPC — `request_camera_access`

Single Postgres function. All enforcement here.

```sql
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
  v_inc_type    text;
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
    -- Public/municipal camera: always-allow with public_domain basis.
    -- Still write the audit row so "every access has an audit entry" holds.
    v_basis := 'public_domain';
  ELSE
    SELECT * INTO v_pol FROM camera_policies WHERE camera_id = p_camera_id;
    IF FOUND THEN
      v_snapshot := to_jsonb(v_pol);

      -- 1. Blocked incident types (homeowner's hardest veto)
      IF p_incident_id IS NOT NULL THEN
        SELECT lower(coalesce(category, type)) INTO v_inc_type
          FROM incidents WHERE id = p_incident_id;
        IF v_inc_type = ANY(v_pol.blocked_incident_types) THEN
          v_allowed := false;
          v_denial  := 'blocked_incident_type';
        END IF;
      END IF;

      -- 2. Warrant requirement (exigent override gated by exigent_allowed)
      IF v_allowed AND v_pol.warrant_required AND NOT p_has_warrant
         AND NOT (v_pol.exigent_allowed AND p_is_exigent) THEN
        v_allowed := false;
        v_denial  := 'warrant_required';
      END IF;

      -- 3. Time window — America/Los_Angeles local time
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
    -- No policy row + contributor exists ⇒ implicit standing_consent (default-allow).
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

CREATE FUNCTION time_in_window(t time, w_start time, w_end time)
RETURNS boolean LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE
    WHEN w_start <= w_end THEN t BETWEEN w_start AND w_end
    ELSE t >= w_start OR t <= w_end       -- handles overnight (22:00–06:00)
  END
$$;

GRANT EXECUTE ON FUNCTION request_camera_access TO service_role;
```

**Evaluation order is intentional:** blocked-type → warrant → time. First
failing check wins so `denial_reason` always names a single, citable cause.

## UI wiring

### `apps/web/app/(app)/incidents/[id]/page.tsx`

Adds two sidebar sections under the existing "Prior Context" block:

```tsx
<section>
  <h2 className="font-mono text-[10px] uppercase tracking-widest">Decision</h2>
  <DecisionPanel
    incidentId={incident.id}
    reviewerHint={`dispatcher:${user.email}`}
  />
</section>

<section>
  <h2 className="font-mono text-[10px] uppercase tracking-widest">Cameras on scene</h2>
  {linkedCameras.map((c) => (
    <CameraAccessRow
      key={c.id}
      cameraId={c.id}
      cameraLabel={c.label}
      incidentId={incident.id}
      isPublic={!c.contributor_id}
    />
  ))}
</section>
```

`linkedCameras` is derived server-side from
`signal_events.where(incident_id).select('camera_id').distinct` joined to
`cameras`. `user.email` comes from the existing Supabase server session
helper.

`CameraAccessRow` is a small client component:
- Idle state: cam label + "Request footage" button.
- Expanded: legal-basis radio (`standing_consent | exigent | warrant`),
  required reason field, submit. POSTs to
  `/api/incidents/[id]/request-camera-access`.
- Result: inline allow/deny banner with `denial_reason` rendered humanly.
- Public cams: button is replaced with "Public camera — always available";
  one-click access still writes a `public_domain` audit event.

### `recordDecision` fan-out (`apps/web/app/(app)/kg/actions.ts`)

After the existing `decisions` table write and `writeReviewedIncidentPage`
call, before the `revalidatePath` block:

```ts
if (parsed.outcome === "hold") {
  const { data: cams } = await supabase
    .from("signal_events")
    .select("camera_id")
    .eq("incident_id", parsed.incidentId)
    .not("camera_id", "is", null);

  const uniqueCameras = [...new Set((cams ?? []).map(c => c.camera_id as string))];
  await Promise.all(uniqueCameras.map(cameraId =>
    supabase.rpc("request_camera_access", {
      p_camera_id: cameraId,
      p_incident_id: parsed.incidentId,
      p_accessed_by: `dispatcher:${parsed.reviewer}`,
      p_legal_basis: "standing_consent",
      p_reason: parsed.reason ?? "hold: pending corroboration",
      p_has_warrant: false,
      p_is_exigent: false,
    })
  ));
}
```

Each fan-out call writes its own audit row regardless of allow/deny —
giving the citizen a record of the request even when the policy declines.

### API routes

`POST /api/incidents/[id]/request-camera-access`:

```ts
const schema = z.object({
  cameraId:    z.string().uuid(),
  legalBasis:  z.enum(['standing_consent','exigent','warrant']),
  reason:      z.string().min(1).max(500),
  hasWarrant:  z.boolean().default(false),
  isExigent:   z.boolean().default(false),
});

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const supabaseUser = await createClient();
  const { data: { user } } = await supabaseUser.auth.getUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const body = schema.parse(await req.json());
  const supabase = adminClient();  // service role for the RPC
  const { data, error } = await supabase.rpc('request_camera_access', {
    p_camera_id:   body.cameraId,
    p_incident_id: params.id,
    p_accessed_by: `dispatcher:${user.email}`,
    p_legal_basis: body.legalBasis,
    p_reason:      body.reason,
    p_has_warrant: body.hasWarrant,
    p_is_exigent:  body.isExigent,
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data[0]);
}
```

`POST /api/cameras/[id]/request-access` is the same handler with
`p_incident_id = null` and `params.id` mapped to `p_camera_id`. Used by the
`/live/[id]` button.

### `/live/[id]` button

`request-access-button.tsx` — client component that wraps the same form
shape as `CameraAccessRow`. Posts to `/api/cameras/[id]/request-access`.

## Demo seed (`scripts/seed-demo.ts`)

Idempotent. Run with `pnpm tsx scripts/seed-demo.ts`.

1. **Dispatcher user** `dispatcher@watchdog.local` created via the Admin API
   with password from `DEMO_DISPATCHER_PASSWORD` (fallback `WatchDog2026!`).
2. **Contributor** with token `demo-mission-16th` (no `removed_at`).
3. **Camera** "Mission & 16th HLS" at `(37.7651, -122.4194)`, contributor
   linked, HLS URL from the existing fixture used by other test cameras.
4. **`camera_policies`** for that camera: `geofence_radius_m=200`,
   no time window, `warrant_required=false`, `exigent_allowed=true`,
   `blocked_incident_types=[]`. The demo flips `warrant_required` to true
   mid-script.
5. **Three GBrain `reviewed_incident` pages** at Mission & 16th, all
   `outcome=dismiss`, source `watchdog`, slugs
   `demo-mission-16th-prior-{1,2,3}`. Body content matches the script
   ("late-night fight detection, bar-closing crowd").
6. **Five wall-fill public cameras** (no contributor) with hand-picked HLS
   URLs from a known-good list (Embarcadero, Twin Peaks, North Beach,
   Castro, SoMa). All have `contributor_id = null` so the RPC short-circuits
   to `public_domain`. Spec B grows this set to ≥20 and adds an SFMTA
   scraper behind a cron flag.
7. **One pre-staged signal trio** linked to the demo incident
   (camera detect + 911 transcript + citizen report). Lights up the wall,
   map, and triage queue on a fresh load.

The script is idempotent: upserts on `(token)`, `(camera_id)`,
`(slug, source_id)`, etc.; safe to re-run between rehearsals.

## Verification

### Unit (`vitest`)

- `time_in_window` — table-driven cases for overnight (22:00–06:00) and
  same-day (08:00–20:00) windows, edge times.
- RPC contract tests against a local Postgres / Supabase branch:
  - Public cam (contributor_id null) → `allowed=true`, `legal_basis=public_domain`, snapshot null.
  - Contributor cam, no policy row → `allowed=true`, `legal_basis` preserved, snapshot null.
  - `warrant_required && !p_has_warrant && !p_is_exigent` → deny `warrant_required`.
  - `warrant_required && p_has_warrant` → allow.
  - `warrant_required && exigent_allowed && p_is_exigent` → allow.
  - `blocked_incident_types` match → deny `blocked_incident_type`.
  - Outside-window → deny `outside_time_window`.
  - Allow path snapshots the policy row into `policy_snapshot`.

### Integration

- Seed runs cleanly; idempotent (re-run produces no duplicates and no errors).
- `POST /api/incidents/[id]/request-camera-access` happy-path returns
  `{event_id, allowed, denial_reason, policy_snapshot}` and writes the row.
- `recordDecision({outcome:'hold'})` against the seeded incident writes:
  one `decisions` row + one `reviewed_incident` GBrain page + N
  `camera_access_events` (one per unique incident-linked camera).
- Auth: anonymous POST to the API routes returns 401.

### Playwright end-to-end

Replays the DEMO_SCRIPT. Each beat asserts both DOM and DB state:

1. Dispatcher signs in as `dispatcher@watchdog.local`.
2. Opens the seeded Mission & 16th incident — Prior Context shows three
   dismissed prior incidents.
3. Clicks **Hold**, fills reason, submits — the `decisions` row exists and
   one `camera_access_events` row was written for the seeded camera.
4. Opens a second tab at `/c/demo-mission-16th` — audit table shows the
   new row with reason and basis.
5. Toggles `warrant_required = true` in the policy editor — `camera_policies`
   row updated.
6. Back to dispatcher view, clicks **Request footage** on the camera row,
   basis `standing_consent`, submits — denial banner appears with
   `warrant_required`; second tab's audit table renders the denial row.

Screenshots captured at every step into `apps/web/test-results/`.

### Line-by-line review pass

For every new/edited file, explicit walk-through against the audit
constraint set:

- No hardcoded color classes (the project is monochrome-only).
- No `any`. Zod at all API boundaries.
- All DB calls error-handled; no thrown promises.
- RLS verified: anon role cannot reach `camera_access_events`; service-role
  inserts only.
- New UI follows the existing mono+border aesthetic and renders sensibly
  with empty data.

### Typecheck / test

```
pnpm typecheck
pnpm test
```

No `pnpm build` — known to kill the running `next dev` server.

## Risks + open questions

- **`incidents.category` vs `incidents.type`** — the RPC reads
  `coalesce(category, type)`. Need to confirm the column name on the
  current `incidents` table during execution; fall back to whichever exists.
- **Existing `decisions` table** — already exists per `recordDecision`.
  Migration assumes it. If it's missing in some envs it predates this
  spec; we'll surface and add a compensating migration during execution.
- **Realtime publication add** — non-destructive but tenant-scoped. Should
  be safe; smoke-tested by the Playwright run.
- **Demo passwords** — `WatchDog2026!` is a placeholder. Real demo runs
  should set `DEMO_DISPATCHER_PASSWORD` in `.env.local`.

## Out of scope, deliberately

- Spec B (camera catalog expansion / SFMTA scraper / public-cam category at
  scale). Tracked separately.
- Re-styling color violations (separate audit item, not in this spec).
- Mobile responsiveness pass.
- Live HLS clip serving keyed to the new event id.
