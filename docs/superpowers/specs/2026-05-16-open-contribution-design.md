# OpenContribution — Design

**Date:** 2026-05-16
**Status:** Approved, ready for plan
**Aligned to:** PRD §5.2 (citizen audit dashboard) and §5.3 (OpenContribution registration)

## Purpose

Let any camera owner (gas station, bodega, parking lot, individual homeowner) plug their feed into WatchDog with one POST or one short form. Once registered, their cameras participate in the fusion pipeline like any CalTrans camera. The owner is hands-off — no operator console, no queries, no policy work. They observe via a passive dashboard, and get an SMS when their own camera catches something. The system does the rest.

## Onboarding flow (lowest friction)

Two equivalent entry points, same backend:

1. **API:** `POST /api/contribute` — body: `{ name, contact_phone, lat, lng, stream_url, stream_type?, hours? }`.
2. **Web form:** `/contribute` — four required fields (name, phone, location, stream URL) + a "where is this camera?" map picker.

Response in both cases:

```json
{
  "contributor_id": "uuid",
  "dashboard_url": "https://caltrans-cctv.vercel.app/c/<token>",
  "verify_url": "https://caltrans-cctv.vercel.app/c/<token>/verify"
}
```

Backend immediately sends an SMS with a 6-digit code to `contact_phone`. The owner taps the magic URL (texted to them too, since the API caller may not know the URL on first POST), enters the code, and their cameras flip to `verified` + `is_active`. No password. No login. The opaque token in the URL is the auth.

A `Remove me` button on the dashboard immediately deactivates all of the contributor's cameras and stops future notifications. Removing also writes an audit-log entry visible to the contributor.

## SMS notifications

- Triggered when the fusion engine finalizes an incident whose centroid is within 500 m of a contributor's camera **and** the camera contributed at least one signal to the incident.
- Body: `WatchDog detected <type> near your camera <name> at <time>. SFPD notified. Track: /c/<token>/i/<incident_id>`.
- Delivered via Twilio if `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, and `TWILIO_FROM_NUMBER` env vars are present. Otherwise the body is logged to the server log so the demo runs without a Twilio account.
- One SMS per incident per contributor. Subsequent signals from the same incident don't re-notify.

## Passive dashboard (`/c/[token]`)

Read-mostly. The owner visits to see, not to operate. Sections in order:

1. **Cameras.** List of their registered cameras with location, status (active / paused / unverified), and a per-camera on/off toggle. Toggling logs to the audit trail.
2. **Recent activity.** Incidents their feeds participated in over the last 30 days. Each row: timestamp, incident type, severity, the cameras of theirs that contributed, link to the incident detail page. Read-only — no decision buttons here.
3. **Audit log.** Every query against their cameras: timestamp, querying agency, badge or analyst ID, incident reference, legal basis, allow/deny verdict, footage clip pulled (link if allowed).
4. **Footer:** policy in effect (default: geofence 500 m, all incident types, `exigent_ok`), contact phone (masked), `Remove me` button.

No policy editor in v1. The default policy applies to every camera. Policy editor lives behind a future flag.

## Data model

### `contributors` table

```sql
CREATE TABLE contributors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  contact_phone text NOT NULL UNIQUE,
  contact_email text,
  token text NOT NULL UNIQUE,              -- 32-byte random, base64url, the dashboard auth
  verification_code text,                  -- 6 digits, plaintext, expires_at gates use
  verification_expires_at timestamptz,
  verified_at timestamptz,
  hours_json jsonb,                        -- optional [{ start: "06:00", end: "23:00", days: [...] }]
  created_at timestamptz NOT NULL DEFAULT now(),
  removed_at timestamptz
);

CREATE INDEX ON contributors (token);
```

### `cameras` (modify existing)

Add nullable foreign key. `NULL` = CalTrans-sourced (no contributor).

```sql
ALTER TABLE cameras
  ADD COLUMN contributor_id uuid REFERENCES contributors(id) ON DELETE CASCADE;

CREATE INDEX ON cameras (contributor_id);
```

### `contributor_notifications` table

```sql
CREATE TABLE contributor_notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contributor_id uuid NOT NULL REFERENCES contributors(id) ON DELETE CASCADE,
  incident_id uuid NOT NULL REFERENCES incidents(id) ON DELETE CASCADE,
  channel text NOT NULL CHECK (channel IN ('sms', 'email', 'log')),
  body text NOT NULL,
  status text NOT NULL CHECK (status IN ('queued', 'sent', 'failed')) DEFAULT 'queued',
  sent_at timestamptz,
  error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (contributor_id, incident_id)
);
```

The unique constraint on `(contributor_id, incident_id)` is what keeps a given owner from being SMS-spammed by the same incident.

### Reuse: `access_events`

Existing `access_events` table (TRD §3.6) already records every query against any camera. The dashboard's audit log reads from it filtered to the contributor's cameras. No schema change needed.

### RLS

- `contributors`: nobody reads except via the token path (token is in URL; we look it up server-side and use the row, never expose it via PostgREST). RLS denies all client reads.
- `contributor_notifications`: same — server-only, never client-readable.
- `cameras`: existing RLS unchanged; auth gate already in place.

The contributor dashboard runs entirely as a server component fetching by token, so the client never touches Supabase directly for any contributor row.

## API endpoints

| Method | Path | Auth | Purpose |
|---|---|---|---|
| POST | `/api/contribute` | none | Register a new camera. Creates contributor + camera rows in `unverified` state, sends SMS code. |
| POST | `/api/contribute/verify` | token in URL + code in body | Mark contributor as `verified_at = now()`, cameras `is_active = true`. |
| POST | `/api/contribute/remove` | token in URL | Soft-delete: set `cameras.is_active = false`, `contributors.removed_at = now()`, log audit entry. |

All three are public (no Supabase Auth gate) and rate-limited by IP (10/min) to deter scraping.

## Page routes

| Path | Type | Purpose |
|---|---|---|
| `/contribute` | server | Public registration form (4 fields). |
| `/c/[token]` | server | Passive contributor dashboard. |
| `/c/[token]/verify` | server | Verify-code entry (sets `verified_at`). |
| `/c/[token]/i/[incident_id]` | server | Single-incident detail (which of their cameras contributed, what queries hit it, allowed/denied). |

The `[token]` segment is opaque enough (32 bytes random) that we treat it as a credential. We log access by IP to detect brute-force; even at one attempt per millisecond the brute-force window is astronomical.

## Notification pipeline

A Postgres trigger function runs on `incidents` insert/update when `status` flips to a finalized state, OR on every fusion-engine write that adds a signal_id to an incident. For each unique contributor whose camera contributed a signal to that incident and is within 500 m of the incident's centroid:

1. Insert into `contributor_notifications` with `status = 'queued'`.
2. A Next.js cron route (Vercel Cron, every minute) reads queued notifications, sends via Twilio (or logs the body if Twilio env vars are unset), and updates `status` + `sent_at` + `error`.

The cron route is gated by `CRON_SECRET`, same pattern as the existing camera-sync cron.

## Default policy (no editor in v1)

Every contributor camera is created under a default policy row that says:

- Geofence: 500 m
- Allowed incident types: all
- Warrant requirement: `exigent_ok` (allows queries on incidents with severity ≥ 0.8 without a warrant; requires warrant otherwise)
- Time windows: 24/7

The policy editor UI is explicit non-goal for v1. Policies are still recorded as `camera_policies` rows so the policy-as-code enforcer (TRD §4) works unchanged.

## Out of scope for v1

- Login / password authentication
- Bulk camera upload (one camera per POST for v1; iterate later)
- Payment, incentives, or revenue share
- Policy editor UI
- Camera health monitoring beyond what the existing detector reports
- HLS proxy/tunneling for cameras behind NAT (assume the contributor's stream URL is publicly reachable; defer NAT traversal to a future spec)
- Multi-tenant: still SFPD-only as the consumer

## Demo notes

For the hackathon demo, we seed one synthetic contributor (a fake gas station) at a SoMa intersection so that one of the wd-fixture incidents already has a "contributor camera" attached. Walking through the demo:

1. Open `/contribute` on stage, fill in the form with a real phone number.
2. The SMS lands; enter the code; cameras flip active on screen.
3. Open `/map` — the new camera appears as a contributor pin (visually distinct from CalTrans pins — outline-only square).
4. Trigger the scripted incident at that location.
5. The contributor's phone buzzes with the WatchDog SMS.
6. Open `/c/[token]` — the incident appears in their feed, with the audit log showing the SFPD query.

If Twilio isn't wired, step 2 reads the code from the server log; step 5 reads the SMS body from the server log.

## Risks

- **The contributor can't be trusted to actually own the camera at that location.** Mitigation: we visibly mark contributor cameras as `source: open-contribution` in the dispatcher view so a dispatcher knows the feed isn't government-vetted. A future spec adds owner verification (camera-presented QR challenge), out of scope here.
- **The endpoint becomes a spam target.** Mitigation: IP rate limit + phone-number uniqueness + SMS verification — none of which deter a determined attacker, but all of which deter casual abuse for a hackathon-grade build.
- **Stream URLs go stale.** Mitigation: existing camera-active heuristic (the same logic the wall uses for "no signal") flips `is_active = false` after N failed pulls; a future cron sends a maintenance SMS to the contributor.
