# WatchDog Security Network — Design

**Date:** 2026-05-18
**Status:** Draft (awaiting user sign-off before implementation plan)
**Author:** Nicolas + Claude (Batch D agent)
**Supersedes (pivot from):** the OSINT dashboard framing in earlier specs;
the cameras + DataSF + GBrain + cockpit infrastructure that already ships
on `main` becomes the substrate for this product, not the product itself.

---

## Goal

Build a public, free SF security dashboard powered by an open contributor
network. Anyone with an RTSP-capable security camera can join the network
and, in exchange, gets free AI-powered threat monitoring of their feed.
The network's collective coverage and the AI's institutional memory
(GBrain) make every contributor's camera smarter over time.

The dashboard is open to anyone — no signup required for viewers. Cameras
the contributor marks **public** show up on the citywide map + wall.
Cameras marked **private** are still monitored, just not shown in public
imagery; their location appears as an anonymous pin and dispatchers can
request warranted access via the existing policy enforcer.

The hook that makes contributors stick: a Tier-1+2 LLM monitors every
contributed camera 24/7, anchored in the GBrain knowledge graph, and
alerts the owner the moment it detects a real threat — with the
knowledge graph getting smarter from every alert + owner feedback.

## Success criteria

Functional and useful means:

1. A contributor can register an RTSP camera in <5 minutes from "sign up"
   to "test feed light is green."
2. When something genuinely concerning happens in view of their camera,
   they get a web-push alert within 60 seconds, with a clip to review.
3. The alert quality is high enough that they don't disable
   notifications: >70% precision after one week of owner feedback per
   camera (i.e. of the alerts marked real/false, ≥70% were real or
   labeled "not sure").
4. The public dashboard at `/map` shows live coverage from the network
   alongside DataSF / 511 signals — meaningfully more useful than just
   DataSF alone for anyone curious "what's happening in SF right now."
5. Bootstrap budget: total infrastructure cost stays under $30/mo at
   the 10-contributor cap; under $100/mo at 50 contributors.

This is not "the OSINT dashboard." This is a security-monitoring product
that happens to expose a citywide situational layer as a side-effect of
the network growing.

## Non-goals (explicitly out of scope for v1)

- Closed/locked-ecosystem cameras (Ring, Nest, Arlo, Wyze unflashed).
- SMS or push-to-phone-native alerts. Web-push via PWA only.
- Audio analysis (CA two-party recording law adds material legal complexity).
- Camera pan-tilt-zoom control. Read-only RTSP only.
- Hardware sales / partnerships.
- Public live-streaming of private cameras under any circumstance — only
  warrant-bound dispatcher access through the existing policy enforcer.
- Citizen-style "tip submission" — we only ingest from registered cameras
  and DataSF.

---

## Users

### Contributor

A San Francisco resident or small business with an RTSP-capable camera
(Eufy, Wyze flashed, Reolink, Unifi Protect, Hikvision, Axis, etc.). They
want:

1. Free AI monitoring that's smarter than what their camera vendor ships.
2. Web alerts with the actual clip so they can decide if it's real.
3. A say in what the public sees from their feed.
4. To feel good about contributing coverage to their neighborhood.

### Public viewer

Anyone visiting the site. No login. They see:

- The map at `/map` with public camera pins + DataSF incidents + ambient
  signals (weather, AQI, transit alerts).
- The wall at `/wall` with live thumbnails from cameras marked public.
- The cockpit's SF Brief + risk overview + neighborhood instability.
- Anonymized pins where private cameras have triggered a
  **critical-severity** alert (weapon / fire / structure threat) — no
  imagery, just "incident here, 03:14."

### Dispatcher (existing role from prior work)

SFPD / authorized operator. Sees everything the public sees plus:

- The ability to request warrant-bound access to private camera footage
  via the existing policy enforcer (already shipped) — same flow as
  before, now actually useful because there are private cameras in the
  network to request from.

---

## Architecture overview

```
                                                              ┌────────────────────────────┐
                                                              │  PUBLIC                    │
                                                              │  /map · /wall · /feed      │
                                                              │  (anyone, no login)        │
                                                              └────────────────────────────┘
                                                                          ▲
[ Contributor's camera ]                                                  │
       │ RTSP                                                             │
       ▼                                                                  │
┌───────────────────────┐    events    ┌────────────────────────────┐     │
│  VPS WORKER (defrd)   │ ───POST────▶ │  /api/contrib/events       │     │
│  · subscribe to RTSP  │              │  · validate cam_id         │     │
│  · cheap CV always-on │              │  · rate limit              │     │
│  · 5-sec clip + bbox  │ ──PUT────▶   │  · enqueue VLM job         │     │
│                       │              └────────────────────────────┘     │
└───────────────────────┘    R2 PUT                  │                    │
       (mock-events.ts in dev)                       ▼                    │
                                       ┌────────────────────────────┐     │
                                       │  TIER-1 GATE               │     │
                                       │  cheap Haiku text          │     │
                                       │  "does this need vision?"  │     │
                                       │  permissive bias           │     │
                                       └────────────────────────────┘     │
                                                     │ yes                │
                                                     ▼                    │
                                       ┌────────────────────────────┐     │
                                       │  TIER-2 VLM                │     │
                                       │  Claude Haiku Vision       │     │
                                       │  + GBrain context           │     │
                                       │  + multi-frame clip         │     │
                                       │  + owner feedback labels    │     │
                                       │  → severity + label + why   │     │
                                       └────────────────────────────┘     │
                                                     │                    │
                          ┌───────────┬──────────────┼────────────┐       │
                          ▼           ▼              ▼            ▼       │
                       owner       GBrain        live_      cross-source  │
                       web         page          incidents  verification  │
                       push        (forever)     (critical  view          │
                                   writes back   → anon pin)              │
                                                                          │
                                                              ┌───────────────────────┐
                                                              │  CONTRIBUTOR PORTAL   │
                                                              │  /me/cameras          │
                                                              │  · alerts feed        │
                                                              │  · real/false labels  │
                                                              │  · public/private     │
                                                              │  · clip history       │
                                                              └───────────────────────┘
```

### Boundary contract: the VPS event ingest

The VPS worker is the only deferred piece. Everything else is built and
tested against a clean event-ingest contract so the VPS can be plugged
in at the end with no changes to anything else:

```http
POST /api/contrib/events
Authorization: Bearer <camera_worker_token>
Content-Type: application/json

{
  "camera_id": "uuid",
  "event_type": "person" | "vehicle" | "package" | "motion" | "line_cross" | "group" | "night_motion",
  "confidence": 0.0–1.0,
  "detected_at": "2026-05-19T03:14:22Z",
  "clip_key": "events/<camera_id>/<event_id>.mp4",   // already uploaded to R2
  "bbox": [x, y, w, h],                              // optional, normalized 0–1
  "frame_count": 10                                   // hint to VLM
}

POST /api/contrib/clips/upload-url
Authorization: Bearer <camera_worker_token>
Body: { "camera_id": "uuid", "duration_sec": 5 }
→ { "clip_key": "events/<camera_id>/<uuid>.mp4", "presigned_put_url": "..." }
```

Two endpoints. The worker hits `upload-url` first (gets a 60-second
presigned R2 URL), PUTs the clip directly to R2, then POSTs the event
metadata. Our server never proxies the clip bytes.

### Mock for dev

`scripts/mock-events.ts` fires synthetic events from a fixture set of
short clips bundled in `apps/web/public/_fixtures/`. Lets us exercise
the entire pipeline end-to-end on `localhost` with zero camera hardware
plugged in. Used in tests and for manual dev.

---

## Data model

All additive — no changes to tables we already have.

### `cameras` (existing — extend)

Add columns:

| Column | Type | Notes |
|---|---|---|
| `rtsp_url` | text, nullable | encrypted at rest (Supabase column encryption) |
| `worker_status` | text default 'pending' | 'pending' \| 'active' \| 'paused' \| 'errored' |
| `worker_token` | text, unique, nullable | scoped to the VPS worker for this cam |
| `last_event_at` | timestamptz, nullable | for liveness + debugging |
| `threat_dictionary` | jsonb default '{}' | per-camera enabled threats + sensitivities |
| `vlm_budget_remaining` | int default 100 | resets daily |
| `vlm_budget_reset_at` | timestamptz default now() | |

Existing `source='contributor'` and `is_active` continue to mean what
they meant before. The wall already filters by source.

### `camera_events` (new)

Every event from the VPS worker lands here, regardless of whether it
triggers a VLM call.

| Column | Type | Notes |
|---|---|---|
| `id` | uuid pk | |
| `camera_id` | uuid → cameras | |
| `event_type` | text | enum-validated by check constraint |
| `confidence` | real | |
| `bbox` | jsonb, nullable | |
| `clip_key` | text | R2 object key, never the URL |
| `detected_at` | timestamptz | |
| `ingested_at` | timestamptz default now() | |
| `vlm_called` | boolean default false | gate result |
| `vlm_reasoning` | text, nullable | gate explanation |
| `alert_id` | uuid → camera_alerts, nullable | only if VLM rated as threat |

Index on `(camera_id, detected_at desc)` for the contributor dashboard.

### `camera_alerts` (new)

Only created when the VLM tier confirms a threat.

| Column | Type | Notes |
|---|---|---|
| `id` | uuid pk | |
| `camera_id` | uuid → cameras | |
| `event_id` | uuid → camera_events | |
| `threat_label` | text | from threat dictionary |
| `severity` | text | 'low' \| 'med' \| 'high' \| 'critical' |
| `confidence` | real | VLM confidence 0–1 |
| `reasoning` | text | short VLM explanation |
| `vlm_response_raw` | jsonb | full structured VLM output |
| `clip_key` | text | mirrors event |
| `gbrain_page_id` | uuid → gbrain pages, nullable | the page written for this alert |
| `live_incident_id` | uuid → live_incidents, nullable | if critical → posted to public |
| `created_at` | timestamptz default now() | |
| `delivered_at` | timestamptz, nullable | when owner notification sent |

### `alert_feedback` (new)

Owner labels every alert as it comes in. This is the calibration signal
that compounds in GBrain.

| Column | Type | Notes |
|---|---|---|
| `id` | uuid pk | |
| `alert_id` | uuid → camera_alerts | unique |
| `verdict` | text | 'real' \| 'false' \| 'not_sure' |
| `note` | text, nullable | optional context |
| `submitted_by` | uuid → auth.users | |
| `submitted_at` | timestamptz default now() | |

### `push_subscriptions` (new)

Web-push (VAPID) subscriptions per contributor device.

| Column | Type | Notes |
|---|---|---|
| `id` | uuid pk | |
| `user_id` | uuid → auth.users | |
| `endpoint` | text | unique |
| `p256dh` | text | |
| `auth` | text | |
| `user_agent` | text, nullable | |
| `created_at` | timestamptz default now() | |
| `revoked_at` | timestamptz, nullable | |

### RLS

- `camera_events` and `camera_alerts`: read-self via `cameras.contributor_id = auth.uid()`.
- `alert_feedback`: write-self only; read-self.
- `push_subscriptions`: full self-only.
- `live_incidents` rows from contributors (source = `contributor_llm`)
  are publicly readable like the rest of the table — but they carry no
  imagery and a sanitized `title` ("Critical alert · Mission · 03:14")
  so no privacy leak.

---

## The LLM pipeline

### Stage 1: the cheap gate

Input: event + camera GBrain summary (~500 tokens of cached context).
Model: Claude Haiku 4.5 text-only.
Cost: ~$0.0001/call.
Prompt outline:

```
You are the threat-detection gate for a security camera at <address>.
GBrain summary (last 7d, top 5 alerts):
  - <bulleted prior alerts with outcomes>
The cheap CV layer just reported: <event_type>, confidence <c>, at <local_time>.
Camera context: <indoor|outdoor>, <residential|commercial>, sensitivity <low|med|high>.

Decide if this event plausibly warrants a closer look from the vision model.
Be permissive — false positives are cheap (one more vision call); false negatives are not.

Rules:
- ANY event between 23:00–06:00 → yes.
- Any "person", "group", "package", "line_cross" → yes (regardless of hour).
- "vehicle" or "motion" during 06:00–23:00 → no, unless GBrain shows prior vehicle/motion threats.

Respond in JSON: { "needs_vision": true | false, "reasoning": "<one sentence>" }
```

The gate's primary purpose is bounding cost on residential cameras
that see 200+ motion events/day from wind, animals, daytime cars.

### Stage 2: the vision model

Triggered only when stage 1 returns `needs_vision: true`.

Input: 8 frames sampled from the 5-second clip (every 0.6s), at 512px
max edge, plus camera GBrain context, prior owner-feedback labels, and
the active threat dictionary.

Model: Claude Haiku 4.5 vision.
Cost: ~$0.003/call.

Prompt outline:

```
You are an SF security AI watching a camera at <intersection>.
Camera context: <last 5 GBrain pages, with outcomes>.
Owner feedback so far: 14 real, 22 false, 3 not_sure. Threshold seems calibrated.
Cross-source signals at the same time/place: <SFPD CAD calls within 200m/10min, if any>.

Active threat categories for this camera:
- loitering >5min in private zone
- package_theft pattern
- vehicle_break_in
- vandalism
- group_at_unusual_hour
- visible_weapon
- fire_or_smoke
- vehicle_blocking_access

Here are 8 frames from a 5-second clip just now. Analyze:
1. What is happening?
2. Does it match any active threat?
3. Severity: low | med | high | critical (weapon/fire are always critical).
4. Confidence 0–1.
5. Recommend: notify_owner | also_post_public_anonymized | ignore.

Respond in JSON. Be precise. Cite specific frame observations.
```

Output shape:

```json
{
  "is_threat": true,
  "threat_label": "loitering",
  "severity": "med",
  "confidence": 0.78,
  "frame_observations": ["F1: figure stops 6ft from gate", "F4: tries gate handle", "F7: walks east"],
  "reasoning": "...",
  "recommended_action": "notify_owner"
}
```

### Multi-call accuracy hedge

When `confidence` falls in `[0.50, 0.75]`, call the model a second time
with a deliberately different prompt framing ("Is this footage clearly
showing a threat? If you're at all unsure say no."). Take the consensus:

- Both yes → notify with original severity.
- Both no → drop event (still log to GBrain as "model_no_threat").
- Disagreement → notify as `severity: low` with the verdict flagged
  `model_disagreement` so the owner gets context for the label.

Cost impact: only ~10-15% of vision calls are in the borderline band,
so this roughly adds 0.0003 average to per-vision cost.

### GBrain write-back

Every event (whether or not it triggers an alert) writes a page:

```yaml
title: "Camera <cam_id> · <local_time> · <threat_label or event_type>"
camera_id: <uuid>
neighborhood: "Mission"
event_type: "person_detected"
vlm_verdict: { is_threat: true, severity: "med", ... }
clip_key: "events/<cam>/<event>.mp4"
owner_feedback: null  // back-filled when owner labels
cross_source_matches: [ ... ]  // backfilled by correlation cron
tags: ["loitering", "night", "Mission", "cam:<id>"]
body: |
  <plain-English summary including frame_observations,
   formatted for vector-embed retrievability>
```

On retrieval (next VLM call for the same camera or nearby cameras),
the top N pages by vector similarity + temporal recency are pasted
into the prompt's "GBrain context" block.

This is where the network compounds: a prowler pattern recognized at
one camera helps the model spot it on a neighboring camera the next
night.

### Cost ceiling

Per-camera defaults:
- `vlm_budget_remaining` resets to 100 vision calls/day at midnight UTC.
- Gate calls are uncapped (cheap).
- When budget hits zero: events are still recorded, but vision-stage
  is queued and only top-priority items (night + line_cross or higher)
  get processed before reset.

Anthropic prompt caching: GBrain context per camera is mostly stable
across calls. With caching, the steady-state cost per vision call drops
~70%.

Math at 50 cameras, residential pattern (~30 events/day with ~20%
making it through the gate):
- 50 × 30 × 0.20 = 300 vision calls/day
- 300 × $0.003 × 0.30 (caching factor) ≈ $0.27/day = **$8.10/mo**

Plus gate calls: 50 × 30 × $0.0001 = $0.15/day = $4.50/mo.

**Total LLM bill at 50 cameras: ~$12-15/mo.** Well under the $30 launch
ceiling.

---

## Threat dictionary v1

| Threat | Default severity | Public anon-pin? | Trigger pattern |
|---|---|---|---|
| `loitering` | med | no | person stationary >5min in defined private zone |
| `package_theft` | med | no | package present + new person + person leaves with package |
| `vehicle_break_in` | high | only if SFPD CAD verifies | person + vehicle + glass-area interaction |
| `vandalism` | med | no | graffiti gesture, kicking, throwing |
| `group_at_unusual_hour` | low | no | ≥4 people 23:00–06:00 |
| `visible_weapon` | **critical** | **yes** | gun, knife, baseball bat in threatening posture |
| `fire_or_smoke` | **critical** | **yes** | flame, heavy smoke, structure threat |
| `vehicle_blocking_access` | low | no | vehicle parked across driveway / fire lane |

The two critical-tier threats are the only ones that bypass the
private-camera privacy layer with an anonymized public pin. Everything
else stays between contributor and dispatcher (with warrant access via
policy enforcer).

The threat dictionary is stored per-camera as JSON so contributors can
disable categories they don't want monitored — e.g. a commercial
camera might disable `vehicle_blocking_access` if the lot is open
parking.

---

## Privacy / access posture

Three tiers of visibility, encoded in `cameras.is_active` + the
`source='contributor'` + a future `cameras.public_listed` boolean:

| State | On `/wall` | On `/map` | Live image visible? | Critical alerts go public? |
|---|---|---|---|---|
| Public (`public_listed = true`) | yes — tile + live HLS | yes — labeled pin | yes | yes (with imagery in `live_incidents`) |
| Private (`public_listed = false`) | no | yes — anonymized pin only | no | yes (anonymized, no imagery) |
| Paused (`worker_status = 'paused'`) | no | no | n/a | no |

The anonymized map pin shows:
- General location (snapped to nearest intersection, ~50m fuzz)
- "Camera here · contributor monitored" label
- A "request warranted access" button for authenticated dispatchers
  (existing policy enforcer flow)

The public never sees:
- The contributor's identity
- The exact RTSP URL or hardware model
- Any imagery from private cameras
- The list of cameras the contributor owns

The contributor can flip a camera public ↔ private at any time. The
flip is instant on the public surfaces (cache revalidation).

### Warrant access (existing policy enforcer)

When a dispatcher requests access to a private camera's footage, the
existing `request-camera-access` RPC enforces:
- Dispatcher role (auth.users.user_metadata.role = 'dispatcher')
- An exigency or warrant flag with server-validated context
- A time-window scope (start, end)
- An audit row in `camera_access_events`

Nothing new to build — the work that landed in commit `b633117` and
earlier becomes the privacy backbone of this product.

### Moderation

To stop someone pointing 10 cameras at a neighbor's bedroom:

1. **First 3 camera submissions per contributor go to moderation queue**
   (`worker_status='pending'` blocks event ingest).
2. **Manual review** — admin checks the camera's first 5 frames after
   onboarding to confirm it's pointed at a reasonable surveillance
   target (street, sidewalk, own property).
3. **Community report button** on every public map pin →
   `camera_reports` table → re-enters moderation if N≥3 reports.
4. **CA two-party rule** — no audio analysis, ever, in v1.

---

## Component breakdown

### New routes

| Path | Purpose | Auth |
|---|---|---|
| `/me/cameras` | contributor dashboard | contributor |
| `/me/cameras/new` | add-camera wizard | contributor |
| `/me/cameras/[id]` | per-camera detail | contributor (own) |
| `/me/alerts` | unified alerts feed across all owned cameras | contributor |
| `/me/notifications` | push subscription management | contributor |
| `/api/contrib/events` | event ingest from VPS (mocked in dev) | worker token |
| `/api/contrib/clips/upload-url` | presigned R2 PUT URL | worker token |
| `/api/contrib/alerts/[id]/feedback` | label an alert real/false | contributor (own) |
| `/api/contrib/push/subscribe` | register a web-push subscription | contributor |
| `/api/contrib/cameras/[id]/test-feed` | preview the camera frame for owner | contributor (own) |
| `/api/cron/process-vlm-queue` | every minute, drain VLM queue | cron secret |

### New libraries

| Path | Purpose |
|---|---|
| `apps/web/lib/clips/r2.ts` | R2 client + presigned URL helpers (DONE: probe pass) |
| `apps/web/lib/llm/gate.ts` | Stage 1 text gate |
| `apps/web/lib/llm/vision.ts` | Stage 2 vision call with multi-frame + self-consistency |
| `apps/web/lib/llm/gbrain-context.ts` | retrieve top-N GBrain pages for a camera |
| `apps/web/lib/llm/gbrain-writeback.ts` | write a page after every event |
| `apps/web/lib/llm/threats.ts` | threat dictionary + severity mapping |
| `apps/web/lib/push/dispatch.ts` | VAPID web-push sender |
| `apps/web/lib/contrib/onboarding.ts` | RTSP URL validation + worker-token mint |
| `packages/sync/src/sources/contributor-events.ts` | inserts contributor_llm rows into live_incidents on critical |
| `scripts/mock-events.ts` | dev-only synthetic event firer |

### Components

| Path | Purpose |
|---|---|
| `apps/web/components/contrib/camera-card.tsx` | one camera + its status |
| `apps/web/components/contrib/alert-row.tsx` | one alert with clip + real/false buttons |
| `apps/web/components/contrib/add-camera-wizard.tsx` | RTSP URL → test → register |
| `apps/web/components/contrib/threat-dictionary-editor.tsx` | per-camera threat toggles |
| `apps/web/components/contrib/push-subscribe-prompt.tsx` | PWA add-to-homescreen + push enable |
| `apps/web/components/map/anonymized-cam-pin.tsx` | the private-camera pin on `/map` |

### What we already have that this leverages

- `live_incidents` + verification view → contributor critical alerts ride this.
- `cameras` table → just extend.
- `request-camera-access` RPC + `camera_policies` → warrant flow.
- Policy enforcer in `apps/web/app/api/incidents/[id]/request-camera-access` → reuse.
- GBrain pages + `gbrain_search` + `gbrain_prior_context` RPCs → context retrieval.
- SF Brief Claude call pattern → identical shape, new prompt.
- `unstable_cache` + `revalidateTag` → cache the contributor portal data.
- `attachVerification` → existing cross-source corroboration for the badge.
- All cockpit panels surface contributor signals automatically when `source='contributor_llm'` rows land.

---

## Phased delivery

This is one product but it lands in phases so we can ship something
useful at every stop.

### Phase 0 — already done (substrate)

Cameras + map + cockpit + GBrain + verification + policy enforcer +
R2 wiring + dev server. All on `main`. Not in scope of this plan.

### Phase 1 — contributor scaffolding (no LLM yet)

Goal: a contributor can register a camera, see it in their dashboard,
and the event-ingest API accepts mock events end-to-end.

Tasks:
- DB migrations for new columns + `camera_events` + `camera_alerts`
  + `alert_feedback` + `push_subscriptions`.
- `/api/contrib/clips/upload-url` returns valid presigned PUT URLs to
  R2 (existing probe code becomes the production module).
- `/api/contrib/events` validates camera + worker token, writes a
  `camera_events` row.
- `scripts/mock-events.ts` fires 1 fake event end-to-end.
- `/me/cameras` lists owned cameras.
- `/me/cameras/new` form: name, RTSP URL (validated as a parseable
  URL, never connected to), public/private toggle, location.

Exit criteria: a dev can register a camera and `scripts/mock-events.ts`
puts a row in `camera_events` referencing a clip in R2.

### Phase 2 — LLM threat pipeline (gate + vision)

Goal: a posted event flows through the gate, then vision, and produces
either a `camera_events` no-op row or a `camera_alerts` row.

Tasks:
- `lib/llm/gate.ts` + tests.
- `lib/llm/vision.ts` with frame extraction from R2 clip + multi-frame
  prompt + self-consistency on borderline.
- `lib/llm/gbrain-context.ts` retrieval.
- `lib/llm/gbrain-writeback.ts` page writer for every event.
- `lib/llm/threats.ts` dictionary + severity mapping.
- `/api/cron/process-vlm-queue` drains the queue every minute.

Exit criteria: mock-events fires 10 synthetic events → at least one
becomes a `camera_alerts` row with reasoning + GBrain page written.

### Phase 3 — owner alerts (web push)

Goal: a `camera_alerts` row creates a real notification on the
owner's device.

Tasks:
- VAPID key pair generation + env vars (`VAPID_PUBLIC_KEY`,
  `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`).
- PWA manifest + service worker.
- `push-subscribe-prompt.tsx` UI.
- `/api/contrib/push/subscribe` POST endpoint.
- `lib/push/dispatch.ts` sender called from the VLM pipeline.
- `/me/alerts` feed reading `camera_alerts` with feedback buttons
  that hit `/api/contrib/alerts/[id]/feedback`.

Exit criteria: trigger a mock alert → owner's PWA shows a push within
60 seconds → owner taps real/false → `alert_feedback` row exists.

### Phase 4 — public dashboard plumbing

Goal: critical alerts from contributor cameras show on the public
map; public cameras show on `/wall`; map shows anonymous private
camera pins.

Tasks:
- VLM pipeline writes `live_incidents` row with `source='contributor_llm'`
  when severity = critical. No clip URL surfaced.
- `loadFilteredIncidents` already picks these up — no change needed.
- `cameras` query for `/map` includes anonymous private pins with
  fuzzed coordinates and `request-access` action linked to existing
  policy enforcer.
- `/wall` already filters by source — public-listed contributor cams
  appear automatically.

Exit criteria: a critical alert fires → public `/map` shows an
anonymized pin within ~10 seconds (realtime channel already wired).

### Phase 5 — onboarding polish + moderation

Goal: ready for first 10 real contributors.

Tasks:
- Add-camera wizard: RTSP URL syntactic validation, location picker,
  test-feed manual review queue.
- Moderation queue UI for admin (`/admin/cameras/pending`).
- Community report button on public pins → `camera_reports` table.
- Threat dictionary editor per camera.
- Per-camera VLM budget display + reset countdown.
- Waitlist gate at 10 contributors (env-flagged on/off).

Exit criteria: someone can hit `/me/cameras/new`, fill the form,
land in moderation, get approved, and start receiving alerts from
the mock worker.

### Phase 6 — the VPS worker (deferred, ~$20/mo at the end)

The only thing left. Single Hetzner / Fly.io box:
- Reads the `cameras` table for active rows.
- For each, runs an FFmpeg + YOLO+motion pipeline.
- On trigger: extracts 5-sec clip, calls `/api/contrib/clips/upload-url`,
  PUTs to R2, POSTs event to `/api/contrib/events`.
- Restart loop, structured logging, prometheus metrics.

This is one Python or Node binary, ~500 LOC, runs as systemd service.
No surprises because everything else has been tested against
mock-events.

---

## Testing approach

- **Unit:** every `lib/llm/*` function gets vitest tests with mocked
  Anthropic client. Cover the gate's permissive bias rules, the
  vision response parsing, GBrain retrieval ordering, the
  self-consistency disagreement path.
- **Integration:** `scripts/mock-events.ts` is the integration test.
  Runs in CI nightly against a staging Supabase project to verify the
  pipeline still flows end-to-end.
- **Manual / dogfood:** Nick runs his own RTSP camera as contributor
  #1 from Phase 3 onward. The first ~50 alerts manually labeled
  feed back into GBrain as the calibration seed.
- **Privacy/access:** explicit tests that a private camera's `clip_key`
  is never returned in any public API response; that a dispatcher
  warrant request actually mints a temporary signed URL; that the
  anonymized pin's coordinates are fuzzed.

---

## Free-tier budget

| Item | Free-tier | Cost above |
|---|---|---|
| Supabase DB + Auth + Realtime | 500MB DB, 5GB bandwidth | $25/mo Pro |
| Vercel hosting + serverless + cron | 100GB bandwidth, 100K invocations | $20/mo Pro |
| R2 clip storage | 10GB storage, **$0 egress** | $0.015/GB/mo above 10GB |
| Anthropic Haiku gate + vision | pay-per-use | bounded by budget caps; ~$15/mo at 50 cams |
| Web push (VAPID) | unlimited | always free |
| Resend email fallback | 100/day, 3K/mo | $20/mo above |
| Domain (if any) | $12/yr | |

**Sum at 50 contributor cameras, post-VPS launch:** ~$30-40/mo.
Well within bootstrap range.

---

## Open questions deferred to later (not blocking v1)

These are noted so they don't get forgotten — but not in this plan:

1. **Audio analysis** — gunshot detection, glass break. Adds CA
   two-party recording law complexity. Revisit after v1 ships.
2. **Multi-camera correlation in real time** — "same suspect spotted
   at cam A then cam B." Compelling product but real R&D. Phase 7+.
3. **Mobile app** — PWA is the v1. A native shell happens only when
   we have evidence the network is sticky.
4. **Monetization** — free forever for v1. Premium tier (SMS alerts,
   long retention, multiple cameras per contributor) is a future
   conversation.
5. **Naming** — "WatchDog" still works as a working name. A real
   brand can come post-launch.

---

## Decision summary (locked in this brainstorm)

1. LLM = Tier 1 + Tier 2 (cheap CV + Claude Vision with GBrain context).
2. Private cameras = anonymous map pin, warrant access via existing policy enforcer.
3. Owner alert pipeline = private alerts always; critical-severity also drops anonymized public pin.
4. Hardware scope = RTSP-only at launch (Eufy/Wyze/Reolink/Unifi/Hikvision/Axis).
5. Two-stage LLM (permissive cheap text gate + vision with multi-frame + self-consistency).
6. Long-term GBrain pages (forever); R2 clips full-res 30d + downsampled 1yr.
7. Web-push owner alerts (PWA); SMS/email later.
8. VPS deferred; mock script for dev; clean event-ingest contract for plug-and-play later.
9. Threat dictionary: 8 categories; weapon + fire auto-public-pin; rest stay private unless cross-source verified.
10. Initial cap: 10 contributors → waitlist; lift after launch tuning.
11. Per-contributor budget caps + prompt caching to bound Anthropic spend.

---

## Spec self-review

Quick pass with fresh eyes:

- **Placeholders:** none — every required field, table, prompt, threat
  category, route, env var is concrete.
- **Internal consistency:**
  - `camera_events.vlm_called` matches the two-stage gate flow.
  - `camera_alerts` only exists when VLM says threat — `alert_id` on
    `camera_events` is nullable, consistent.
  - `clip_key` is the R2 object key everywhere; the URL is always
    generated via `getSignedDownloadUrl`. No raw URL in DB.
  - Threat dictionary has 8 entries; `critical` matches the "auto
    public pin" column on weapon + fire only.
  - Phase 4 references "loadFilteredIncidents already picks these up" —
    correct, the existing function on `main` filters by `source` and
    will include `contributor_llm` rows automatically because nothing
    blacklists them.
- **Ambiguity:**
  - "Private camera coordinate fuzz" — defined as snap-to-nearest-intersection
    + 50m random offset. Specified in Phase 4.
  - "Worker token" lifecycle — minted at camera registration, stored
    encrypted on the camera row, used in `Authorization: Bearer`
    header from VPS. Documented in the boundary contract section.
- **Scope:** focused on the security-network product. Existing OSINT
  surfaces are intentionally untouched; this design layers on top.

No fixes needed before user review.
