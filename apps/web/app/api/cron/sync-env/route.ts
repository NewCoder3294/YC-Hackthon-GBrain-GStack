// Single fan-out cron for the env_signals layer.
//
// Calls all six Batch B sources in parallel via Promise.allSettled so a
// transient upstream failure (NWS down, OpenSky 429, etc.) doesn't take
// out the rest. Each successful source's rows are batched into a single
// upsertEnvSignals call. The route returns 200 when every source either
// succeeded or was disabled via missing key, 207 otherwise so monitoring
// can distinguish partial-success from total failure.

import { NextResponse, type NextRequest } from "next/server";
import { revalidateTag } from "next/cache";
import { createDb } from "@caltrans/db";
import type { NewEnvSignal } from "@caltrans/db";
import {
  fetchNwsAlerts,
  fetchPurpleAir,
  fetchUsgsQuakes,
  fetchAdsb,
  fetchAis,
  fetchBartMtaAlerts,
  upsertEnvSignals,
} from "@caltrans/sync";
import { env } from "@/lib/env";
import { isAuthorizedCron } from "@/lib/cron-auth";
import { ENV_SIGNALS_CACHE_TAG } from "@/lib/cockpit/environmental";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// AIS websocket snapshot consumes ~10s by itself; allow generous headroom.
export const maxDuration = 60;

interface SourceOutcome {
  source: string;
  status: "ok" | "skipped" | "error";
  upserted: number;
  attempted: number;
  dropped: number;
  durationMs: number;
  error?: string;
  disabled?: boolean;
}

async function runSource(
  name: string,
  fn: () => Promise<{
    rows: NewEnvSignal[];
    attempted: number;
    dropped: number;
    disabled?: boolean;
  }>,
): Promise<SourceOutcome & { rows: NewEnvSignal[] }> {
  const start = Date.now();
  try {
    const res = await fn();
    return {
      source: name,
      status: res.disabled ? "skipped" : "ok",
      upserted: 0, // filled in by caller after batch upsert
      attempted: res.attempted,
      dropped: res.dropped,
      durationMs: Date.now() - start,
      ...(res.disabled ? { disabled: true } : {}),
      rows: res.rows,
    };
  } catch (err) {
    return {
      source: name,
      status: "error",
      upserted: 0,
      attempted: 0,
      dropped: 0,
      durationMs: Date.now() - start,
      error: err instanceof Error ? err.message : "unknown error",
      rows: [],
    };
  }
}

export async function GET(request: NextRequest) {
  if (!isAuthorizedCron(request.headers.get("authorization"))) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  if (!env.DATABASE_URL) {
    return NextResponse.json(
      { error: "DATABASE_URL not set" },
      { status: 500 },
    );
  }

  const db = createDb(env.DATABASE_URL);

  // Note: every source receives the global `fetch` so it can be swapped
  // by tests later. AIS uses the global WebSocket.
  const results = await Promise.all([
    runSource("nws_alerts", () => fetchNwsAlerts()),
    runSource("purpleair", () =>
      fetchPurpleAir({ apiKey: env.PURPLEAIR_API_KEY }),
    ),
    runSource("usgs_quakes", () => fetchUsgsQuakes()),
    runSource("adsb_opensky", () =>
      fetchAdsb({
        clientId: env.OPENSKY_CLIENT_ID,
        clientSecret: env.OPENSKY_CLIENT_SECRET,
      }),
    ),
    runSource("aisstream", () =>
      fetchAis({ apiKey: env.AISSTREAM_API_KEY, durationMs: 10_000 }),
    ),
    runSource("bart_mta", () =>
      fetchBartMtaAlerts({
        bartApiKey: env.BART_API_KEY,
        sf511ApiKey: env.SF_511_API_KEY,
      }),
    ),
  ]);

  // Batch upsert per source so a problem with one source's rows can be
  // diagnosed in isolation.
  for (const r of results) {
    if (r.status !== "ok" || r.rows.length === 0) continue;
    try {
      r.upserted = await upsertEnvSignals(db, r.rows);
    } catch (err) {
      r.status = "error";
      r.error = err instanceof Error ? err.message : "upsert failed";
    }
  }

  revalidateTag(ENV_SIGNALS_CACHE_TAG);

  const allOk = results.every((r) => r.status !== "error");
  const summary = results.map(({ rows: _rows, ...rest }) => rest);
  return NextResponse.json(
    { ok: allOk, ranAt: new Date().toISOString(), sources: summary },
    { status: allOk ? 200 : 207 },
  );
}
