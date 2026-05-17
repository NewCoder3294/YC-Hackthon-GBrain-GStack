import { getSql } from "./db";
import type { IngestRequest } from "./ingest";
import { getConfig } from "./config";

/**
 * Hand-authored demo scenarios. Each one returns an IngestRequest that
 * looks like a real fused incident — pinned to a real camera near the
 * scenario's coordinates so the dispatcher view's clip + map render
 * cleanly. Locations and gang affiliations are chosen to match the
 * existing gbrain pages so the dispatcher's Prior Context panel surfaces
 * meaningful matches.
 */

export interface Scenario {
  key: string;
  /** Drives the title and prior_context queries. */
  title: string;
  /** Free-text dispatcher note rendered on /incidents/[id]. */
  notes: string;
  severity: "low" | "med" | "high";
  lat: number;
  lng: number;
  /** Optional gang slug for tagging — looked up in the gangs table at ingest time. */
  gangAlias?: string;
  /** Signal mix that drove the fusion — used in gbrain intel_note + UI. */
  signals: Array<{
    kind: "camera_public" | "camera_private" | "call_911" | "citizen_report";
    label: string;
    confidence?: number;
  }>;
}

export const SCENARIOS: Scenario[] = [
  {
    key: "mission-16th-fight",
    title: "Possible assault — Mission & 16th",
    notes:
      "Camera detected fighting; 911 hangup from same block 11s later; citizen report 2min after. Cross-territory window matches historical pattern.",
    severity: "high",
    lat: 37.7649,
    lng: -122.4194,
    gangAlias: "TL13",
    signals: [
      { kind: "camera_public", label: "Pose detection: fighting", confidence: 0.71 },
      { kind: "call_911", label: "911 hangup", confidence: 0.6 },
      { kind: "citizen_report", label: "Citizen: 'loud argument outside BART'", confidence: 0.5 },
    ],
  },
  {
    key: "tenderloin-disturbance",
    title: "Disturbance — Jones & Eddy",
    notes:
      "Camera detected raised voices; 911 call reported group congregating. Matches Tenderloin baseline; 4 dismissals at this corner in last 30d.",
    severity: "med",
    lat: 37.7836,
    lng: -122.4131,
    signals: [
      { kind: "camera_public", label: "Audio: raised voices", confidence: 0.55 },
      { kind: "call_911", label: "911: group congregating", confidence: 0.62 },
    ],
  },
  {
    key: "bayview-sc-plate",
    title: "SC vehicle plate match — 3rd & Newcomb",
    notes:
      "ALPR matched known SC plate; citizen report confirmed two individuals exiting matching description. Cross-territory event.",
    severity: "high",
    lat: 37.7299,
    lng: -122.3829,
    gangAlias: "Sunset Cartel",
    signals: [
      { kind: "camera_public", label: "ALPR plate match (Sunset Cartel watchlist)", confidence: 0.84 },
      { kind: "citizen_report", label: "Citizen: matching description", confidence: 0.6 },
    ],
  },
  {
    key: "soma-collision",
    title: "Multi-vehicle collision — I-80 at Powell",
    notes:
      "Camera detected stopped vehicles + heat plume; CHP request inbound. Two-car collision blocking #2 lane.",
    severity: "high",
    lat: 37.785,
    lng: -122.405,
    signals: [
      { kind: "camera_public", label: "Stopped vehicles + thermal anomaly", confidence: 0.88 },
      { kind: "call_911", label: "CHP request inbound", confidence: 0.92 },
    ],
  },
  {
    key: "outer-sunset-narco",
    title: "Suspected narco meet — Judah & 25th",
    notes:
      "Camera flagged hand-off pattern; pattern matches Outer Sunset Q2 2026 intel note. Low confidence — likely citizen-report quality signal.",
    severity: "low",
    lat: 37.7615,
    lng: -122.4836,
    gangAlias: "Sunset Cartel",
    signals: [
      { kind: "camera_public", label: "Hand-off pattern", confidence: 0.43 },
      { kind: "citizen_report", label: "Citizen: 'suspicious meet'", confidence: 0.38 },
    ],
  },
];

interface NearestCameraRow {
  id: string;
  caltrans_id: string;
  description: string;
  route: string;
  direction: string | null;
  stream_url: string;
  stream_type: "hls" | "mjpeg";
  dist_m: number;
}

/**
 * Pick the nearest camera using Haversine in SQL. Falls back to any camera if
 * the DB hasn't been seeded with district 4 yet.
 */
export async function nearestCamera(
  lat: number,
  lng: number,
): Promise<NearestCameraRow | null> {
  const sql = getSql();
  const [row] = await sql<NearestCameraRow[]>`
    SELECT
      id::text,
      caltrans_id,
      description,
      route,
      direction,
      stream_url,
      stream_type,
      (
        2 * 6371000 * asin(sqrt(
          sin(radians(${lat} - lat) / 2) ^ 2 +
          cos(radians(lat)) * cos(radians(${lat})) *
          sin(radians(${lng} - lng) / 2) ^ 2
        ))
      ) AS dist_m
    FROM cameras
    WHERE is_active = true
    ORDER BY dist_m ASC
    LIMIT 1
  `;
  return row ?? null;
}

/**
 * Resolve a gang alias (TL13, Sunset Cartel, etc.) to its uuid. Tolerates
 * partial / case matches because the existing seed has mixed casing.
 */
export async function resolveGangId(alias: string): Promise<string | null> {
  const sql = getSql();
  const [row] = await sql<Array<{ id: string }>>`
    SELECT id::text FROM gangs
    WHERE name ILIKE ${alias} OR ${alias} = ANY(aliases) OR name ILIKE ${"%" + alias + "%"}
    LIMIT 1
  `;
  return row?.id ?? null;
}

/**
 * Materialize a scenario into the exact shape /api/openclaw/ingest expects.
 * Looks up the nearest camera, picks the most recent existing clip on that
 * camera for storage_path (so the dispatcher view can actually play the
 * clip in the demo), and resolves the gang alias if any.
 */
export async function scenarioToIngestRequest(
  scenario: Scenario,
): Promise<IngestRequest> {
  const cfg = getConfig();
  const sql = getSql();
  const camera = await nearestCamera(scenario.lat, scenario.lng);
  if (!camera) {
    throw new Error(
      `no cameras in db — run cron/sync-cameras first to seed before demo`,
    );
  }
  const gangId = scenario.gangAlias ? await resolveGangId(scenario.gangAlias) : null;

  // Reuse a recent existing clip on this camera if we have one — the dispatcher
  // view's `getClipSignedUrl(storage_path)` will then return a real playable
  // clip. If none, synthesize a placeholder path; the page falls back to the
  // camera's live MJPEG stream.
  const [existingClip] = await sql<
    Array<{ storage_path: string; thumbnail_path: string; started_at: Date }>
  >`
    SELECT storage_path, thumbnail_path, started_at
    FROM clips
    WHERE camera_id = ${camera.id}::uuid
    ORDER BY started_at DESC
    LIMIT 1
  `;

  const startedAt = new Date(Date.now() - 5_000); // 5s ago — "just happened"
  const incident = {
    title: scenario.title,
    notes: scenario.notes,
    severity: scenario.severity,
    created_by: cfg.WORKER_USER_ID,
    ...(gangId ? { suspect_gang_id: gangId } : {}),
  };
  const clip = {
    camera_id: camera.id,
    started_at: startedAt.toISOString(),
    duration_s: 30,
    storage_path:
      existingClip?.storage_path ??
      `openclaw-scenarios/${scenario.key}-${Date.now()}.mp4`,
    thumbnail_path:
      existingClip?.thumbnail_path ??
      `openclaw-scenarios/${scenario.key}-${Date.now()}.jpg`,
  };
  return { incident, clips: [clip] };
}

/**
 * Pick the next scenario in a round-robin fashion using a hash of the
 * current minute. Stable across short polls; cycles through all over time.
 */
export function pickScenario(now: Date = new Date()): Scenario {
  const minute = Math.floor(now.getTime() / 60_000);
  const scenario = SCENARIOS[minute % SCENARIOS.length];
  if (!scenario) {
    // SCENARIOS is non-empty (asserted by tests), so this is unreachable —
    // but the type system can't prove that across array index access with
    // noUncheckedIndexedAccess.
    throw new Error("SCENARIOS is empty");
  }
  return scenario;
}
