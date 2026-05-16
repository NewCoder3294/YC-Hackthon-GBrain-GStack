# WatchDog — Technical Requirements Document

**Companion to:** PRD.md
**Build window:** 12 hours
**Team:** 5 engineers

---

## 1. Architecture overview

Three logical layers, deliberately decoupled so people can build in parallel without blocking each other.

**Layer 1 — Ingestion.** Three independent producers (camera detector, 911 transcript generator, citizen report form) write events to a shared event store. Producers don't know about each other and don't know about the fusion layer.

**Layer 2 — Fusion and memory.** A correlation engine reads from the event store, joins signals within spatial-temporal windows, produces ranked incidents, and writes them to GBrain along with all dispatcher decisions and outcomes. GBrain is queried at incident-display time to enrich the dispatcher view with prior context.

**Layer 3 — Surfaces.** Two web UIs (dispatcher view, citizen view) read from the incident store and GBrain. The citizen view also writes policy changes back through the policy-as-code enforcement module.

```
┌─────────────────────────────────────────────────────────────────────┐
│                          INGESTION                                   │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐          │
│  │ Camera       │    │ 911 Transcript│    │ Citizen      │          │
│  │ Detector     │    │ Generator     │    │ Report Form  │          │
│  │ (YOLOv8)     │    │ (scripted)    │    │ (web)        │          │
│  └──────┬───────┘    └──────┬───────┘    └──────┬───────┘          │
│         │                   │                   │                    │
│         └───────────────────┼───────────────────┘                    │
│                             ▼                                        │
│                    ┌────────────────┐                                │
│                    │  Signal Events │ (Postgres table)               │
│                    └────────┬───────┘                                │
└─────────────────────────────┼────────────────────────────────────────┘
                              │
┌─────────────────────────────┼────────────────────────────────────────┐
│                    FUSION & MEMORY                                   │
│                             ▼                                        │
│                    ┌────────────────┐                                │
│                    │  Correlator    │ (spatial-temporal joins)       │
│                    └────────┬───────┘                                │
│                             │                                        │
│                             ▼                                        │
│                    ┌────────────────┐         ┌─────────────────┐   │
│                    │   Incidents    │◄────────│     GBrain      │   │
│                    │   (ranked)     │ enrich  │  (prior context,│   │
│                    └────────┬───────┘         │   decisions,    │   │
│                             │                 │   patterns)     │   │
│                             │                 └────────▲────────┘   │
│                             │                          │            │
│                             │              ┌───────────┴────────┐   │
│                             │              │  Decision Writer   │   │
│                             │              └───────────▲────────┘   │
└─────────────────────────────┼──────────────────────────┼────────────┘
                              │                          │
┌─────────────────────────────┼──────────────────────────┼────────────┐
│                          SURFACES                      │            │
│                             ▼                          │            │
│                    ┌────────────────┐                  │            │
│                    │   Dispatcher   │──────dispatcher──┘            │
│                    │   Timeline UI  │      decisions                │
│                    └────────────────┘                               │
│                                                                      │
│                    ┌────────────────┐         ┌─────────────────┐   │
│                    │ Citizen Audit  │◄────────│   Access Log    │   │
│                    │   Dashboard    │         │  (every query)  │   │
│                    └────────┬───────┘         └─────────▲───────┘   │
│                             │                           │            │
│                             ▼                           │            │
│                    ┌────────────────┐                   │            │
│                    │  Policy Editor │───────────────────┤            │
│                    └────────┬───────┘                   │            │
│                             │                           │            │
│                             ▼                           │            │
│                    ┌────────────────┐                   │            │
│                    │ Policy-as-Code │──────gates────────┘            │
│                    │   Enforcer     │      every camera query        │
│                    └────────────────┘                                │
└──────────────────────────────────────────────────────────────────────┘
```

## 2. Stack

- **Backend:** Python (FastAPI) for the fusion engine and APIs. Python because it's where the off-the-shelf object detector lives and where everyone on the team can read it.
- **Frontend:** Next.js / TypeScript / Tailwind. Two separate Next.js apps (or one app with two route groups) for dispatcher and citizen views.
- **Database:** Postgres via Supabase. GBrain runs against the same Postgres instance per the GStack documentation.
- **Object detection:** YOLOv8 (ultralytics package), pre-trained COCO weights. We detect people, vehicles, and a small set of behavior proxies (running, falling, fighting via pose estimation if time permits).
- **LLM calls:** Anthropic Claude (via API) for two things: 911 transcript summarization on the dispatcher view, and GBrain query expansion (the GBrain README documents this as the supported pattern).
- **Auth:** Supabase Auth, two roles (dispatcher, citizen). Skip SSO, skip MFA, scope a single demo user per role.

## 3. Data model

### 3.1 Signal events table

The shared substrate. Every ingestion source writes here.

```sql
CREATE TABLE signal_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_type TEXT NOT NULL CHECK (source_type IN ('camera', 'call_911', 'citizen_report')),
  source_id TEXT NOT NULL,               -- camera_id, call_id, report_id
  occurred_at TIMESTAMPTZ NOT NULL,
  ingested_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  location GEOGRAPHY(POINT, 4326) NOT NULL,
  payload JSONB NOT NULL,                -- source-specific detail
  confidence REAL,                       -- 0-1 if applicable
  raw_clip_uri TEXT                      -- camera footage pointer
);

CREATE INDEX ON signal_events USING GIST (location);
CREATE INDEX ON signal_events (occurred_at DESC);
```

### 3.2 Incidents table

Output of the correlator. One row per fused incident.

```sql
CREATE TABLE incidents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  centroid GEOGRAPHY(POINT, 4326) NOT NULL,
  earliest_signal_at TIMESTAMPTZ NOT NULL,
  signal_ids UUID[] NOT NULL,            -- references signal_events.id
  severity REAL NOT NULL,                -- 0-1, computed
  incident_type TEXT,                    -- "possible_assault", "vehicle_collision", "disturbance"
  status TEXT NOT NULL DEFAULT 'open',   -- open, acted, held, dismissed
  decision_reason TEXT,
  decided_by TEXT,                       -- dispatcher id
  decided_at TIMESTAMPTZ
);
```

### 3.3 GBrain schema

GBrain is markdown-first and structured. We populate it with three categories of entries (using GBrain's native record model, which supports tags and structured fields per its README):

- **Reviewed incidents:** every incident, post-decision, written as a record tagged `incident:<type>` with fields for location, signal composition, dispatcher decision, outcome, and a free-text reasoning note.
- **Patterns:** auto-extracted recurring combinations (e.g., "camera detection of running + 911 hangup within 30s + same block has been dismissed 4 of 5 times as false positive"). Generated by a lightweight rule on top of the incidents table, written as GBrain records tagged `pattern:false_positive` or `pattern:correlated`.
- **Neighborhood baselines:** per-grid-cell rolling stats (calls per week, dismissals per week, common incident types), refreshed periodically, written as records tagged `baseline:<grid_cell>`.

At incident-display time, the dispatcher view queries GBrain with a structured query: "give me records relevant to this location, this incident type, and this signal combination." GBrain's query expansion via Anthropic surfaces semantically related prior records.

### 3.4 Cameras table

```sql
CREATE TABLE cameras (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID NOT NULL REFERENCES citizens(id),
  display_name TEXT NOT NULL,
  location GEOGRAPHY(POINT, 4326) NOT NULL,
  registered_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  policy_id UUID NOT NULL REFERENCES camera_policies(id)
);
```

### 3.5 Camera policies table

The policy-as-code layer. Policies are evaluated as structured predicates, not free-text settings.

```sql
CREATE TABLE camera_policies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  camera_id UUID NOT NULL REFERENCES cameras(id),
  effective_from TIMESTAMPTZ NOT NULL DEFAULT now(),
  effective_until TIMESTAMPTZ,           -- null = currently active
  geofence_meters INTEGER NOT NULL,      -- max distance from camera for incident
  time_windows JSONB NOT NULL,           -- [{start: "06:00", end: "22:00", days: [...]}]
  allowed_incident_types TEXT[] NOT NULL,
  warrant_requirement TEXT NOT NULL CHECK (warrant_requirement IN ('always', 'exigent_ok', 'standing_consent')),
  created_by UUID NOT NULL REFERENCES citizens(id)
);
```

Every policy change creates a new row (effective_until set on the old one), so the audit log can show "this query was evaluated under policy version X, here's what that policy was."

### 3.6 Access log table

Every query against a camera, allowed or denied, gets a row here.

```sql
CREATE TABLE access_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  camera_id UUID NOT NULL REFERENCES cameras(id),
  incident_id UUID REFERENCES incidents(id),
  requested_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  requested_by TEXT NOT NULL,            -- "SFPD-Officer-4471" or "automated_correlator"
  legal_basis TEXT NOT NULL CHECK (legal_basis IN ('warrant', 'exigent', 'standing_consent')),
  warrant_ref TEXT,
  policy_id_evaluated UUID NOT NULL REFERENCES camera_policies(id),
  decision TEXT NOT NULL CHECK (decision IN ('allowed', 'denied')),
  denial_reason TEXT,
  footage_pulled_clip_uri TEXT,
  outcome TEXT                           -- "contributed_arrest", "dismissed_alert", "open"
);
```

## 4. The policy-as-code enforcer

A function on the backend that wraps every camera query. Input: requesting officer ID, legal basis, incident reference, target camera. Output: allow + footage URI, or deny + reason. Algorithm:

1. Load active policy for the camera (the row where `effective_until IS NULL`).
2. Check geofence: compute distance from camera to incident centroid. If beyond `geofence_meters`, deny.
3. Check time window: is the requested footage timestamp inside the owner's allowed windows? If not, evaluate the `warrant_requirement`.
4. Check incident type: is the incident's `incident_type` in the policy's `allowed_incident_types`? If not, evaluate the `warrant_requirement`.
5. Check warrant: if `warrant_requirement = always`, require `legal_basis = warrant` with `warrant_ref` present. If `exigent_ok`, allow `exigent` for severity ≥ 0.8 only. If `standing_consent`, allow under owner's defined conditions.
6. Write an access_events row regardless of decision. The denial case is visible to the homeowner too.

Demo-critical: the dispatcher view should show a "request access" affordance on incident detail. Clicking it runs the enforcer in real time. A denial appears in the dispatcher UI as "blocked by owner policy — adjust legal basis or escalate" and immediately shows up in the citizen-side audit log as a denied request. That round-trip is the moment in the demo where policy-as-code stops being a phrase and becomes a thing.

## 5. The correlator

A scheduled job, runs every 5 seconds during demo. Algorithm:

1. Pull signal_events from the last 90 seconds not yet assigned to an incident.
2. Cluster by spatial proximity (within 200m) and temporal proximity (within 60s).
3. For each cluster of size ≥ 2, or any cluster containing a high-confidence camera detection or 911 call, create or update an incident.
4. Compute severity as a weighted function of signal count, confidence values, signal-type diversity, and GBrain-surfaced priors ("this location has X dismissal rate").
5. Classify `incident_type` via simple rules over the contributing signals (camera detects "fighting" + 911 keyword "fight" → "possible_assault").

This is deliberately not ML. Rules plus GBrain context. Easier to demo, easier to defend, faster to build.

## 6. Component ownership

Five people, twelve hours, five tracks. Each track has a clear deliverable and a clear interface contract so nothing waits on anything else.

**Hari — Ingestion (camera + 911).** Owns the YOLOv8 detector running against a looped MP4, writing camera detection events to signal_events. Also owns the 911 transcript generator (scripted scenarios, possibly TTS-narrated for demo flavor, transcripts written to signal_events). Interface contract: writes to signal_events table with specified schema. Demo deliverable: one camera "running" on stage with a visible detection event appearing in the database within 5 seconds.

**Nick — Fusion and GBrain integration.** Owns the correlator job, the incidents table population, and the entire GBrain integration: schema design within GBrain, writing reviewed incidents and decisions, and the query-time enrichment that surfaces prior context to the dispatcher view. This is the most technically central track. Interface contract: reads from signal_events, writes to incidents and to GBrain, exposes a `GET /incidents/:id/context` endpoint that returns GBrain-enriched detail.

**Alex — Dispatcher UI.** Owns the dispatcher fusion timeline (Next.js app, the screen on the left in the diagram). Reads from incidents table via API, calls Hari's context endpoint, displays the decision panel, writes back dispatcher decisions to incidents and triggers GBrain writes. Interface contract: depends on Hari's endpoints, depends on Nick's data populating the tables. Can build against fixture data until Hari and Nick are live.

**Advaidh — Citizen UI and policy editor.** Owns the citizen audit dashboard, the OpenContribution registration flow, and the policy editor. Reads from access_events for the audit log, writes to camera_policies on edits, owns the user-facing presentation of the policy-as-code layer. Interface contract: writes well-formed policy rows, reads well-formed access events. Can build entirely against fixture data until Ishan's enforcer is live.

**Ishan — Policy-as-code enforcer, citizen report form, integration glue.** Owns the enforcer function (the gating wrapper on camera queries), the citizen report web form (third ingestion source), and the integration plumbing between everything else. Interface contract: provides `request_camera_access(...)` as a function call used by the dispatcher backend, writes access_events on every call, returns allow/deny with footage URI. The roving role: when track X is blocked on track Y, Ishan unblocks.

**Pair-ups across tracks:**

- Hari + Nick sync on the signal_events schema in hour 1, then work independently.
- Nick + Alex sync on the `/incidents/:id/context` response shape in hour 1, then work independently.
- Advaidh + Ishan sync on the policy and access_events schemas in hour 1, then work independently.
- All five sync at hour 6 (mid-build checkpoint) and hour 10 (integration crunch). Nobody is allowed to skip hour 6.

## 7. Build sequencing

**Hours 0–1: Schema lock and infra setup.**
- Database schemas written and migrated. GBrain initialized against the Supabase Postgres. Two Next.js apps scaffolded. Camera video file selected and on-disk. Demo scenario sketched (so Nick knows what to script).

**Hours 1–4: Independent build.**
- Each track builds against fixture data. Nobody integrates yet. Goal at hour 4: every component runs in isolation.

**Hours 4–6: First integration.**
- Hari's events land in real signal_events. Nick's correlator produces real incidents. Alex's dispatcher UI shows them. Nick + Alex prove the context-enrichment loop works end-to-end on one scripted scenario.
- Advaidh's citizen dashboard shows real (if mostly empty) access events. Ishan's enforcer is callable.

**Hour 6: Checkpoint.** Everyone demos what they have. Cut features ruthlessly.

**Hours 6–9: The round trip.**
- Wire the dispatcher-side "request access" affordance through Ishan's enforcer to Advaidh's audit log. This is the single most important integration in the whole project. Both ends must light up correctly for the demo to work.

**Hours 9–11: Polish, narrative, and the false positive.**
- Tune the GBrain context surface so it actually says something useful (not "no related incidents found"). Pre-load GBrain with 30-50 synthetic prior incidents so the context panel is meaningfully populated.
- Wire the scripted false-positive scenario: a synthetic incident that the dispatcher dismisses, which then visibly affects GBrain (the next similar incident shows "this signal pattern has been dismissed N times").
- Visual polish on both UIs. The citizen dashboard especially.

**Hour 11–12: Demo rehearsal.**
- Run the demo three times end-to-end. Identify everything that breaks. Fix the worst one. Record the backup video.

## 8. Data plan

We need synthetic data for: signal events (camera detections, 911 transcripts, citizen reports), GBrain prior records (30-50 incidents to populate context), and one homeowner with one camera and 3-4 historical access events.

**Generation approach:** A single seed script (`seed.py`) that populates everything in one run. Crucially, the seed data tells a story: there's a neighborhood that has had several dismissed alerts in the past month (so GBrain has learned that pattern), and the live demo scenario plays out *in* that neighborhood, so the dispatcher sees genuinely useful prior context.

**The demo scenario itself** is scripted in DEMO_SCRIPT.md.

## 9. What we explicitly don't build technically

- No streaming protocol (RTSP, WebRTC). The "camera" reads from a file.
- No real auth provider integration. Hard-coded sessions are fine.
- No deployment to a real cloud beyond Supabase. Local dev servers for the demo.
- No tests beyond manual demo rehearsal. We are not auditing this code; we are demonstrating it.
- No CI/CD. We push to main, we restart the server.
- No mobile app. Citizen reports come through the web form.

## 10. Failure modes and fallbacks

**GBrain integration breaks at hour 9.** Fallback: pre-compute the context panel responses for the demo scenario, serve them from a JSON file. The system *would have* used GBrain; the demo cuts the dependency. We do not mislead the judges; we acknowledge in the talk that the context panel is GBrain-backed and we have the seed script as evidence.

**YOLOv8 detection is too slow on the demo machine.** Fallback: skip live detection, drive camera events from a timestamped JSON file synchronized to the looped video playback. The dispatcher view doesn't know the difference.

**Policy enforcer round-trip is buggy at hour 10.** Fallback: pre-record the round trip as a 15-second screen capture, embed it in the deck. Worst case for that integration only.

**Whole system collapses at hour 11.** Fallback: the recorded 3-minute video. Built early. Always ready.
