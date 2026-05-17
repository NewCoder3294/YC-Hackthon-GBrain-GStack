# Signal-Collapse Animation — Spec + BLOCKER (2026-05-16)

**Status: BLOCKED on upstream data.** Component built in isolation against
the real-data interface (drop-in). Demo wiring is intentionally **gated** —
NOT wired to `watchdog-fixtures.ts` (explicit Option-B requirement).

## Goal

PRD §2 thesis as motion: separate signals (`camera` / `call_911` /
`citizen_report` / `datasf`) appear as pins at their real `lat/lng` +
timestamps, then visually converge into one pulsing ranked incident pin,
with a timeline strip showing each signal's timestamp collapsing into a
single incident row.

## BLOCKER — required data that does not exist

The animation is **Option B: real correlator output only**. It needs an
`incident` whose `signal_ids[]` resolve to the contributing
`signal_events` rows. Neither half exists on any branch as of `a520975`:

1. **No TRD §3.2-shaped `incidents` table.** `packages/db/src/schema.ts`
   `incidents` is `{ id, title, notes, severity(enum low|med|high),
   createdAt, createdBy, suspectGangId }` — a manual clip-tagging table.
   It has **no `signal_ids UUID[]`**, no `centroid`, no
   `earliest_signal_at`, no computed `severity REAL`, no `incident_type`.
   There is no signal↔incident linkage anywhere.
2. **No correlator.** Nothing on `main` or any branch reads
   `signal_events` (verified: zero readers outside `packages/{ingestion,db}`).
   `docs/STATUS.md` states the correlator/fusion engine is Python/FastAPI
   and **"not in this repo"** — it is Nick's track, out-of-repo.

`watchdog-fixtures.ts` is explicitly a placeholder (its own header: *"Replace
with live fusion-engine output once the GBrain pipeline writes here"*). Per
the Option-B instruction, the demo path must NOT fall back to it.

## What must exist to unblock (owner: Nick / correlator track)

### 1. `incidents` table, TRD §3.2 shape

```
incidents(
  id UUID PK,
  centroid_lat double precision NOT NULL,   -- (repo convention: lat/lng
  centroid_lng double precision NOT NULL,   --  doubles, not PostGIS — same
                                            --  decision as signal_events)
  earliest_signal_at timestamptz NOT NULL,
  signal_ids UUID[] NOT NULL,               -- FK-ish → signal_events.id
  severity real NOT NULL,                   -- 0..1 computed
  incident_type text,
  status text NOT NULL DEFAULT 'open',
  ...
)
```

### 2. The exact query the UI needs (incident → signals)

```sql
-- 1. open/ranked incidents for the map
SELECT id, centroid_lat, centroid_lng, earliest_signal_at,
       severity, incident_type, status, signal_ids
FROM incidents
WHERE status = 'open'
ORDER BY severity DESC;

-- 2. resolve one incident's contributing signals (UUID[] → rows)
SELECT id, source_type, occurred_at, lat, lng, payload, confidence
FROM signal_events
WHERE id = ANY($1::uuid[])     -- $1 = incidents.signal_ids
ORDER BY occurred_at ASC;
```

`payload.feed` distinguishes the DataSF source (`datasf_sfpd_incidents`)
within `source_type='call_911'` (see the ingestion contract decision).

### 3. Delivery options (any one unblocks)

- A server action / route handler in `apps/web` returning the typed
  `CollapseIncident` (below) — preferred (Supabase Realtime-friendly).
- Or the correlator writing the §3.2 `incidents` table directly so
  `apps/web` can query it via Drizzle.

## The drop-in interface (already implemented; stable contract)

`apps/web/components/map/signal-collapse.tsx` exports these types. The
future data adapter only has to produce `CollapseIncident`:

```ts
type CollapseSignalKind =
  | "camera_public" | "camera_private" | "call_911" | "citizen_report";

interface CollapseSignal {
  id: string;            // signal_events.id
  kind: CollapseSignalKind; // signal_events.source_type
  feed?: string;         // signal_events.payload.feed (e.g. datasf_sfpd_incidents)
  occurredAt: string;    // ISO — signal_events.occurred_at
  lat: number;           // signal_events.lat
  lng: number;           // signal_events.lng
  label: string;         // derived from payload (category/description/…)
}

interface CollapseIncident {
  id: string;                 // incidents.id
  type: string | null;        // incidents.incident_type
  severity: number;           // incidents.severity (0..1)
  centroid: { lat: number; lng: number };
  earliestSignalAt: string;   // ISO
  signals: CollapseSignal[];  // resolved from incidents.signal_ids[]
}
```

Component contract:

- Props: `{ incident: CollapseIncident | null; project: (lngLat:
  [number, number]) => { x: number; y: number } }`.
  `project` is injected (maplibre `map.project` when mounted over
  `sf-map.tsx`; a linear bbox projector in isolation/tests).
- `incident === null` → renders nothing. **No fixtures fallback.** This is
  the gate: until the correlator produces data, the live demo shows
  nothing rather than fake motion.
- Phases: `scatter` (signals fade in at their projected positions, stagger
  by `occurredAt`) → `converge` (CSS-transform toward projected centroid)
  → `collapsed` (single pulsing incident dot) + a timeline strip whose
  per-signal rows collapse into one incident row. CSS/Tailwind +
  `requestAnimationFrame` only (no `framer-motion` dependency).

## Wiring checklist (do NOT do until unblocked)

- [ ] §3.2 `incidents` table exists (Drizzle schema + migration).
- [ ] Correlator populates it from `signal_events`.
- [ ] `apps/web` adapter maps DB rows → `CollapseIncident` (resolve
      `signal_ids[]` via the query above).
- [ ] Mount `<SignalCollapse>` over `sf-map.tsx` with `map.project`,
      replacing the gate's `null` with the live incident.
- [ ] Remove `watchdog-fixtures` from the map's demo path.

Owner of the blockers: **Nick (correlator/fusion track, out-of-repo per
`docs/STATUS.md`)**. UI side is ready and drop-in.
