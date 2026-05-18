# Batch B (env signals) — Handoff

**Branch:** `feat/batch-b-env`
**Status:** sync + db + cron + loader + panel all landed and committed.
Wiring into shared files (`map/page.tsx`, `cockpit-sidebar.tsx`,
`sf-map.tsx`) was attempted but kept getting reverted by parallel agents
on the same branch, so it's documented below for whichever agent
reconciles last.

## What's in place (committed)

| commit | summary |
|--------|---------|
| `23a4f0b` | `feat(db): env_signals table for multi-kind environmental layer` |
| `df198d9` | `feat(sync): NWS alerts, PurpleAir AQI, USGS quakes sources` |
| `55ac5a9` | `feat(sync): ADS-B aircraft, AIS marine, BART/MTA transit sources` |
| `94e0df3` | `feat(web): sync-env cron route, env loader, env panel` |
| `456103b` | `chore(vercel): register sync-env cron every 5 min` |

## Schema — `env_signals`

```sql
-- packages/db/migrations/0013_env_signals.sql
CREATE TABLE env_signals (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind        text NOT NULL CHECK (kind IN ('weather','aqi','quake','aircraft','vessel','transit')),
  source      text NOT NULL,         -- 'nws_alerts','purpleair','usgs_quakes','adsb_opensky','aisstream','bart_mta'
  source_uid  text NOT NULL,         -- per-source stable id; (source, source_uid) is the upsert key
  lat         double precision,
  lng         double precision,
  severity    text NOT NULL DEFAULT 'low' CHECK (severity IN ('low','med','high')),
  title       text NOT NULL,
  subtitle    text,
  occurred_at timestamptz NOT NULL,
  expires_at  timestamptz,            -- NULL = never expires (rare); active rows are WHERE expires_at IS NULL OR > now()
  ingested_at timestamptz NOT NULL DEFAULT now(),
  raw         jsonb,
  UNIQUE (source, source_uid)
);

CREATE INDEX idx_env_signals_kind_time ON env_signals (kind, occurred_at DESC);
CREATE INDEX idx_env_signals_active    ON env_signals (occurred_at DESC) WHERE expires_at IS NULL OR expires_at > now();
CREATE INDEX idx_env_signals_source    ON env_signals (source);
-- RLS: SELECT for anon + authenticated; added to supabase_realtime publication.
```

Drizzle binding exported as `envSignals` / `EnvSignal` / `NewEnvSignal`
from `@caltrans/db`.

## Files created (new)

| path | purpose |
|------|---------|
| `packages/db/migrations/0013_env_signals.sql` | Migration (table, indexes, RLS, realtime). |
| `packages/sync/src/env-signals.ts` | `upsertEnvSignals(db, rows)` helper (mirrors `upsertLiveIncidents`). |
| `packages/sync/src/sources/nws-alerts.ts` (+ `.test.ts`) | `fetchNwsAlerts()` — keyless NWS CA alerts, SF bbox + SAME-code filter. |
| `packages/sync/src/sources/purpleair.ts` (+ `.test.ts`) | `fetchPurpleAir()` — SF-bbox AQI sensors + synthetic `sf-avg` row. |
| `packages/sync/src/sources/usgs-quakes.ts` (+ `.test.ts`) | `fetchUsgsQuakes()` — keyless USGS `all_hour.geojson`, Bay Area bbox. |
| `packages/sync/src/sources/adsb.ts` (+ `.test.ts`) | `fetchAdsb()` — OpenSky 25km-of-SF, surfaces helicopters + loiterers. |
| `packages/sync/src/sources/ais-marine.ts` (+ `.test.ts`) | `fetchAis()` — AISStream.io websocket snapshot, SF bbox vessels. |
| `packages/sync/src/sources/bart-mta-alerts.ts` (+ `.test.ts`) | `fetchBartMtaAlerts()` — BART BSA + 511 SFMTA, isolated failure modes. |
| `apps/web/app/api/cron/sync-env/route.ts` | Fan-out cron; auths via `isAuthorizedCron`, batches by source. |
| `apps/web/lib/cockpit/environmental.ts` | `loadEnvSignals()` cached loader + `ENV_SIGNALS_CACHE_TAG`. |
| `apps/web/components/cockpit/environmental-panel.tsx` | `EnvironmentalPanel` cockpit widget; top 5 by severity then recency. |

## Files modified (committed by this batch)

| path | change |
|------|--------|
| `packages/db/src/schema.ts` | Added `envSignals` table + `EnvSignal` / `NewEnvSignal` / `EnvSignalKind` types. |
| `packages/sync/src/index.ts` | Re-exported the six new sources + `env-signals` helper. |
| `apps/web/lib/env.ts` | Added Zod entries for `PURPLEAIR_API_KEY`, `OPENSKY_USERNAME`, `OPENSKY_PASSWORD`, `AISSTREAM_API_KEY`, `BART_API_KEY`. |
| `apps/web/.env.example` | Documented the 5 new env vars + their providers. |
| `apps/web/vercel.json` | Added `/api/cron/sync-env` `*/5 * * * *`. |

## Env vars added

| key | required? | failure mode |
|-----|-----------|--------------|
| `PURPLEAIR_API_KEY` | optional | AQI source returns `disabled: true` |
| `OPENSKY_USERNAME` + `OPENSKY_PASSWORD` | optional | ADS-B falls back to keyless rate limits |
| `AISSTREAM_API_KEY` | optional | AIS marine source returns `disabled: true` |
| `BART_API_KEY` | optional | Falls back to the documented public sample key `MW9S-E7SL-26DU-VV8V` |
| `SF_511_API_KEY` | reused | SFMTA half of BART/MTA source needs this; was already in `.env.example` |

Existing `CRON_SECRET` gates the new `/api/cron/sync-env` route via
`isAuthorizedCron`.

## Wiring still required (not committed — kept getting stomped on by parallel agents)

Whichever agent reconciles last needs to apply these **additive** edits.
Everything else is in place; without these the env loader runs but the
panel doesn't receive data on the cockpit and the map doesn't render the
new pins.

### 1. `apps/web/app/(app)/map/page.tsx`

Add one import, one loader, one extra prop on `SFMap` and `CockpitSidebar`:

```diff
 import { loadTrafficDisruptions } from "@/lib/cockpit/traffic-disruptions";
+import { loadEnvSignals } from "@/lib/cockpit/environmental";

 const [
   cameras,
   newsRes,
   liveIncidents,
   instability,
   sfBrief,
   trafficDisruptions,
+  envSignals,
 ] = await Promise.all([
   loadCameraPins(),
   supabase.from("news_incidents").select(...) ...,
   listLiveIncidents({ unacknowledgedOnly: true }),
   loadInstability(),
   loadSFBrief(),
   loadTrafficDisruptions(),
+  loadEnvSignals(),
 ]);

-  <SFMap cameras={cameras} newsIncidents={newsIncidents} />
+  <SFMap cameras={cameras} newsIncidents={newsIncidents} envSignals={envSignals} />

   <CockpitSidebar
     liveIncidents={liveIncidents}
     ...
     trafficDisruptions={trafficDisruptions}
+    envSignals={envSignals}
   />
```

### 2. `apps/web/components/cockpit/cockpit-sidebar.tsx`

Add the import + the prop + one widget array entry:

```diff
 import type { TrafficDisruption } from "@/lib/cockpit/traffic-disruptions";
+import type { EnvSignalRow } from "@/lib/cockpit/environmental";
 import { LiveFeedPanel } from "./live-feed-panel";
+import { EnvironmentalPanel } from "./environmental-panel";

 interface Props {
   ...
   trafficDisruptions: TrafficDisruption[];
+  envSignals?: EnvSignalRow[];
 }

 export function CockpitSidebar({
   ...
   trafficDisruptions,
+  envSignals = [],
 }: Props) {
   const widgets: CockpitWidget[] = [
     ...
     { id: "traffic-disruptions", label: "Traffic Disruptions", defaultSpan: 2, node: <TrafficDisruptionsPanel rows={trafficDisruptions} /> },
+    { id: "environmental",       label: "Environmental",        defaultSpan: 2, node: <EnvironmentalPanel rows={envSignals} /> },
   ];
```

### 3. `apps/web/components/map/sf-map.tsx`

Per the brief: render env layers as toggleable pin sets, **no heavy
refactor** (Batch C owns that). Recommended minimal additive change —
add an `envSignals?: EnvSignalRow[]` prop, a `showEnv` toggle, and a
single HTML-marker layer for env signals with shape varying by `kind`.

```diff
+import type { EnvSignalRow, EnvSignalKind } from "@/lib/cockpit/environmental";
 ...
 interface Props {
   cameras: CamWithCoords[];
   newsIncidents?: NewsIncidentRow[];
+  envSignals?: EnvSignalRow[];
 }

-export function SFMap({ cameras, newsIncidents = [] }: Props) {
+export function SFMap({ cameras, newsIncidents = [], envSignals = [] }: Props) {
   ...
+  const [showEnv, setShowEnv] = useState(true);
+  const [envKinds, setEnvKinds] = useState<Record<EnvSignalKind, boolean>>({
+    weather: true, aqi: true, quake: true, aircraft: true, vessel: true, transit: true,
+  });
+  const envMarkersRef = useRef<Map<string, maplibregl.Marker>>(new Map());
+  // Diff-and-sync the env pin set the same way `newsMarkersRef` does,
+  // keyed on EnvSignalRow.id, with element class `wd-env-marker` +
+  // data-kind so CSS can colour each kind distinctly.
```

The brief calls out 6 toggles on the map control bar:
`Weather / AQI / Quakes / Aircraft / Marine / Transit`.

## Cron + ingester paths

Trigger manually after deploy:

```sh
curl -H "Authorization: Bearer $CRON_SECRET" \
  https://watchdog-yc.vercel.app/api/cron/sync-env
```

Per-source result schema (returned by the route):

```ts
{
  ok: boolean,
  ranAt: string,           // ISO timestamp
  sources: Array<{
    source: string,        // "nws_alerts" | "purpleair" | "usgs_quakes" | "adsb_opensky" | "aisstream" | "bart_mta"
    status: "ok" | "skipped" | "error",
    upserted: number,
    attempted: number,
    dropped: number,
    durationMs: number,
    error?: string,
    disabled?: boolean,    // true when the source's key is missing
  }>
}
```

The route returns **200** when every source either succeeded or was
disabled (missing key); **207** when at least one source threw.

## Tests

- All six source files have >=4 tests each (28 source tests + the
  `pm25ToAqi` helper trio = 33 new test cases).
- Whole sync package: **72 tests passing**, 0 failures.
- Sync + db: `pnpm typecheck` clean.
- Web: `pnpm typecheck` clean after deleting stale `.next/types`
  caches from an unrelated batch-d route that had been removed.
- Web `pnpm test`: **70 tests passing**, 0 failures.

## Open / deferred

1. **Cron-running verification.** I can't actually hit Vercel to
   exercise the cron — needs real upstream API keys + a deploy. All
   tests use mocked `fetch`/`WebSocket`. The first real cron run will
   reveal any upstream response shape drift; fetchers are defensive
   (parse → drop unparseable rows, return `dropped` count).
2. **PurpleAir `sensor_index` column.** Per docs PurpleAir always
   returns `sensor_index` as the first column regardless of the `fields`
   parameter. If their docs are stale, the helper currently reads
   index 0 via `idx("sensor_index")` against the response's `fields`
   array, which would return `-1` and crash. If the first real run
   logs `dropped` ≫ `attempted`, force-pin `iSensor = 0` instead.
3. **AISStream subscription shape.** Docs vary by version. Current
   payload is `{ APIKey, BoundingBoxes: [[[swLat,swLng],[neLat,neLng]]],
   FilterMessageTypes: ["PositionReport"] }`. If the first run yields
   zero messages, double-check `BoundingBoxes` nesting against their
   live docs and cross-reference `FilterMessageTypes` casing.
4. **BART unique key.** BART BSA advisories don't ship a stable UID;
   the source synthesizes `bart-<type>-<posted>-<desc[:32]>` to upsert
   idempotently. If BART changes their `posted` formatting between
   polls a row will look new each time. Acceptable while volume is
   small (≤ a dozen rows/day across all advisories).
5. ~~The three shared-file edits (page / sidebar / sf-map) are documented
   above but were not committed — see "Wiring still required".~~
   **Resolved in commit `7382d2f`.** Page, cockpit sidebar, and sf-map
   now wire envSignals end-to-end; the Env layer toggle and marker pins
   are live on `/map`.

## Resolution (added after merge)

| commit | what landed |
|---|---|
| `6ed7edc` | OpenSky migrated to OAuth2 client credentials. `OPENSKY_USERNAME`/`OPENSKY_PASSWORD` renamed to `OPENSKY_CLIENT_ID`/`OPENSKY_CLIENT_SECRET`. `adsb.ts` now exchanges them for a bearer token at `auth.opensky-network.org/.../openid-connect/token` and caches the token for its TTL. New OAuth2 test added (73/73 sync). |
| `7382d2f` | Shared-file wiring: `map/page.tsx` calls `loadEnvSignals()` and passes envSignals to both SFMap and CockpitSidebar. CockpitSidebar registers EnvironmentalPanel widget. `sf-map.tsx` adds an `envMarkersRef` diff-and-sync useEffect mirroring news markers, plus an `Env` LayerToggle and per-kind/per-severity styled-jsx CSS. Per-kind toggles remain Batch C's scope. |

After this resolution: web typecheck clean, sync typecheck clean, db
typecheck clean, sync **73/73**, web **70/70**.

## Three-line summary

This batch adds the `env_signals` table + six free-tier OSINT
sources (NWS, PurpleAir, USGS, OpenSky, AISStream, BART/MTA) plus a
fan-out cron, a cached loader, a cockpit panel, an Env layer on the
map, and OAuth2 auth for OpenSky. All committed on `feat/batch-b-env`.
The single-table-multi-kind shape lets future sources (tide, lightning,
satellite passes) drop in without schema churn.
