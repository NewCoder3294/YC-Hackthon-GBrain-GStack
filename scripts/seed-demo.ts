// scripts/seed-demo.ts — idempotent seed for the DEMO_SCRIPT round-trip.
//
// Creates:
//   - dispatcher@watchdog.local Supabase Auth user
//   - one contributor + one HLS camera at Mission & 16th + a policy row
//   - three GBrain reviewed_incident pages for the prior-context demo
//   - five public/municipal wall-fill cameras (contributor_id = null)
//   - one staged incident with a clip linking it to the Mission camera
//   - three pre-staged signal_events at the same geo/window
//
// Re-runs are safe: every upsert is keyed on a stable natural key.

import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";

const __dirname = dirname(fileURLToPath(import.meta.url));

try {
  const envPath = resolve(__dirname, "..", "apps", "web", ".env.local");
  for (const line of readFileSync(envPath, "utf-8").split("\n")) {
    const m = line.match(/^([A-Z_]+)=(.*)$/);
    if (m) {
      const key = m[1]!;
      const value = (m[2] ?? "").replace(/^"|"$/g, "");
      if (!process.env[key]) process.env[key] = value;
    }
  }
} catch {
  /* fall back to shell env */
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error(
    "NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.",
  );
  process.exit(1);
}

const supabase = createClient(url, key, { auth: { persistSession: false } });

const DEMO_DISPATCHER_EMAIL = "dispatcher@watchdog.local";
const DEMO_DISPATCHER_PASSWORD = process.env.DEMO_DISPATCHER_PASSWORD;
if (!DEMO_DISPATCHER_PASSWORD) {
  console.error(
    "DEMO_DISPATCHER_PASSWORD is required (set it in apps/web/.env.local or shell env)",
  );
  process.exit(1);
}
const DEMO_TOKEN = "demo-mission-16th";
const DEMO_LAT = 37.7651;
const DEMO_LNG = -122.4194;
const DEMO_INCIDENT_TITLE = "Mission & 16th — fight detection (demo)";

async function upsertDispatcher(): Promise<string> {
  const { data: users } = await supabase.auth.admin.listUsers({
    page: 1,
    perPage: 200,
  });
  const existing = users.users.find((u) => u.email === DEMO_DISPATCHER_EMAIL);
  if (existing) return existing.id;
  const { data, error } = await supabase.auth.admin.createUser({
    email: DEMO_DISPATCHER_EMAIL,
    password: DEMO_DISPATCHER_PASSWORD,
    email_confirm: true,
    user_metadata: { role: "dispatcher" },
  });
  if (error) throw error;
  return data.user!.id;
}

async function upsertContributor(): Promise<string> {
  const { data: existing } = await supabase
    .from("contributors")
    .select("id")
    .eq("token", DEMO_TOKEN)
    .maybeSingle();
  if (existing) return existing.id;
  const { data, error } = await supabase
    .from("contributors")
    .insert({
      name: "Mission & 16th Demo Owner",
      contact_phone: "+14155550100",
      contact_email: "demo-owner@watchdog.local",
      token: DEMO_TOKEN,
      verified_at: new Date().toISOString(),
    })
    .select("id")
    .single();
  if (error) throw error;
  return data!.id;
}

interface CameraSeed {
  caltransId: string;
  district: number;
  route: string;
  description: string;
  lat: number;
  lng: number;
  streamUrl: string;
  contributorId: string | null;
}

// Public wall-fill cams use Mux's public test HLS endpoints — known-good,
// no auth, low risk of pulling down in front of a demo.
const PUBLIC_WALL_CAMS: CameraSeed[] = [
  {
    caltransId: "demo-public-embarcadero",
    district: 4,
    route: "embarcadero",
    description: "Embarcadero & Mission (public)",
    lat: 37.7943,
    lng: -122.3946,
    streamUrl: "https://test-streams.mux.dev/x36xhzz/url_2/url_2.m3u8",
    contributorId: null,
  },
  {
    caltransId: "demo-public-twin-peaks",
    district: 4,
    route: "twin-peaks",
    description: "Twin Peaks viewpoint (public)",
    lat: 37.7544,
    lng: -122.4477,
    streamUrl: "https://test-streams.mux.dev/x36xhzz/url_3/url_3.m3u8",
    contributorId: null,
  },
  {
    caltransId: "demo-public-north-beach",
    district: 4,
    route: "north-beach",
    description: "Columbus & Broadway (public)",
    lat: 37.7977,
    lng: -122.408,
    streamUrl: "https://test-streams.mux.dev/x36xhzz/url_4/url_4.m3u8",
    contributorId: null,
  },
  {
    caltransId: "demo-public-castro",
    district: 4,
    route: "castro",
    description: "Castro & Market (public)",
    lat: 37.7619,
    lng: -122.435,
    streamUrl: "https://test-streams.mux.dev/x36xhzz/url_5/url_5.m3u8",
    contributorId: null,
  },
  {
    caltransId: "demo-public-soma",
    district: 4,
    route: "soma",
    description: "5th & Howard (public)",
    lat: 37.7807,
    lng: -122.4067,
    streamUrl: "https://test-streams.mux.dev/x36xhzz/url_6/url_6.m3u8",
    contributorId: null,
  },
];

async function upsertCamera(seed: CameraSeed): Promise<string> {
  const { data: existing } = await supabase
    .from("cameras")
    .select("id")
    .eq("caltrans_id", seed.caltransId)
    .maybeSingle();
  if (existing) return existing.id;
  const { data, error } = await supabase
    .from("cameras")
    .insert({
      caltrans_id: seed.caltransId,
      district: seed.district,
      route: seed.route,
      description: seed.description,
      lat: seed.lat,
      lng: seed.lng,
      stream_url: seed.streamUrl,
      stream_type: "hls",
      is_active: true,
      contributor_id: seed.contributorId,
    })
    .select("id")
    .single();
  if (error) throw error;
  return data!.id;
}

async function upsertPolicy(cameraId: string): Promise<void> {
  await supabase.from("camera_policies").upsert(
    {
      camera_id: cameraId,
      geofence_radius_m: 200,
      window_start_local: null,
      window_end_local: null,
      warrant_required: false,
      exigent_allowed: true,
      blocked_incident_types: [],
      updated_at: new Date().toISOString(),
    },
    { onConflict: "camera_id" },
  );
}

async function upsertGbrainPriorPages(): Promise<void> {
  for (let i = 1; i <= 3; i++) {
    const slug = `demo-mission-16th-prior-${i}`;
    const compiled = [
      `**Dispatcher decision:** dismiss`,
      "",
      `**Reason:** Bar-closing crowd, recurring false positive (#${i}).`,
      "",
      `**Suspect gang:** —`,
      "",
      `**Severity:** med`,
    ].join("\n");

    const { data: page, error } = await supabase
      .from("pages")
      .upsert(
        {
          source_id: "watchdog",
          slug,
          type: "reviewed_incident",
          page_kind: "markdown",
          title: "Mission & 16th — late-night fight detection (dismissed)",
          compiled_truth: compiled,
          frontmatter: {
            kind: "reviewed_incident",
            meta: { reviewer: "demo-seed", decided_at: new Date().toISOString() },
            source: "derived",
            samples: null,
            confidence: null,
            related_incident_id: null,
            recurrence: i,
          },
        },
        { onConflict: "source_id,slug" },
      )
      .select("id")
      .single();
    if (error || !page) {
      throw new Error(
        `pages upsert failed (slug=${slug}): ${error?.message ?? "no row"}`,
      );
    }

    await supabase.from("tags").delete().eq("page_id", page.id);
    const tagRows = [
      "mission-16th",
      "bar-closing",
      "dismissed",
      "fight-detection",
    ].map((tag) => ({ page_id: page.id, tag }));
    const { error: tagErr } = await supabase.from("tags").insert(tagRows);
    if (tagErr) throw new Error(`tags insert failed: ${tagErr.message}`);
  }
}

async function upsertDemoIncidentTrio(
  dispatcherId: string,
  missionCamId: string,
): Promise<string> {
  const { data: existingInc } = await supabase
    .from("incidents")
    .select("id")
    .eq("title", DEMO_INCIDENT_TITLE)
    .maybeSingle();
  let incidentId: string;
  if (existingInc) {
    incidentId = existingInc.id;
  } else {
    const { data, error } = await supabase
      .from("incidents")
      .insert({
        title: DEMO_INCIDENT_TITLE,
        severity: "high",
        notes:
          "Three corroborating signals: camera detection, 911 audio transcript, citizen report.",
        created_by: dispatcherId,
      })
      .select("id")
      .single();
    if (error) throw error;
    incidentId = data!.id;
  }

  const { data: existingClip } = await supabase
    .from("clips")
    .select("id")
    .eq("incident_id", incidentId)
    .eq("camera_id", missionCamId)
    .maybeSingle();
  if (!existingClip) {
    await supabase.from("clips").insert({
      incident_id: incidentId,
      camera_id: missionCamId,
      started_at: new Date(Date.now() - 5 * 60_000).toISOString(),
      duration_s: 30,
      storage_path: "demo/mission-16th-clip.m3u8",
      thumbnail_path: "demo/mission-16th-thumb.jpg",
    });
  }

  const baseTime = new Date(Date.now() - 5 * 60_000).toISOString();
  type Signal = {
    source_type: "camera_private" | "call_911" | "citizen_report";
    source_id: string;
    payload: Record<string, unknown>;
  };
  const signals: Signal[] = [
    {
      source_type: "camera_private",
      source_id: missionCamId,
      payload: { detection: "fight", confidence: 0.82 },
    },
    {
      source_type: "call_911",
      source_id: "demo-call-mission-16th",
      payload: {
        transcript: "shouting and a fight outside Mission and 16th",
      },
    },
    {
      source_type: "citizen_report",
      source_id: "demo-citizen-mission-16th",
      payload: {
        note: "two people fighting near the bart entrance",
      },
    },
  ];
  for (const s of signals) {
    const { data: existingSig } = await supabase
      .from("signal_events")
      .select("id")
      .eq("source_id", s.source_id)
      .eq("source_type", s.source_type)
      .maybeSingle();
    if (existingSig) continue;
    await supabase.from("signal_events").insert({
      source_type: s.source_type,
      source_id: s.source_id,
      occurred_at: baseTime,
      lat: DEMO_LAT,
      lng: DEMO_LNG,
      payload: s.payload,
      confidence: 0.8,
    });
  }

  return incidentId;
}

async function main() {
  const dispatcherId = await upsertDispatcher();
  const contributorId = await upsertContributor();

  const missionCamId = await upsertCamera({
    caltransId: "demo-mission-16th",
    district: 4,
    route: "Mission",
    description: "Mission & 16th HLS",
    lat: DEMO_LAT,
    lng: DEMO_LNG,
    streamUrl: "https://test-streams.mux.dev/x36xhzz/url_0/url_0.m3u8",
    contributorId,
  });
  await upsertPolicy(missionCamId);
  await upsertGbrainPriorPages();

  for (const seed of PUBLIC_WALL_CAMS) await upsertCamera(seed);

  const incidentId = await upsertDemoIncidentTrio(dispatcherId, missionCamId);

  console.log(
    JSON.stringify(
      {
        ok: true,
        dispatcherEmail: DEMO_DISPATCHER_EMAIL,
        dispatcherId,
        contributorId,
        contributorToken: DEMO_TOKEN,
        missionCamId,
        incidentId,
        publicWallCams: PUBLIC_WALL_CAMS.length,
        urls: {
          incident: `/incidents/${incidentId}`,
          citizen: `/c/${DEMO_TOKEN}`,
        },
      },
      null,
      2,
    ),
  );
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
