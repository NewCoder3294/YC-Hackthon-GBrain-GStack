// Police scanner call metadata via OpenMHz.
//
// OpenMHz (https://openmhz.com) is a volunteer-run free public archive
// of police/fire/EMS scanner audio. SF's metro-area police is on the
// system "sfpdmac"; the JSON API is:
//
//   https://api.openmhz.com/sfpdmac/calls/newer?time=<unix_ms_after>
//
// Response shape (verified against the openmhz.com player):
//   {
//     calls: [
//       {
//         _id: "65f1a2b3c4d5e6f7",
//         time: "2026-05-18T03:14:22.000Z",
//         len: 7,                       // seconds
//         freq: 482487500,              // Hz
//         talkgroupNum: 10000,
//         talkgroupTag: "Citywide-1",
//         talkgroupGroup: "SFPD Operations",
//         talkgroupDescription: "Citywide tac 1",
//         srcList: [{ src: 12345, time: 0 }, ...],
//         url: "/<id>.m4a"              // play prefixed with /audio-bucket/...
//       },
//       ...
//     ]
//   }
//
// We store each call as a `live_incidents` row with kind="scanner"
// and geo_precision="unknown" (scanner calls don't carry geo). The
// title is the talkgroup tag; the audio URL and other metadata go
// into `raw` so a later transcription cron can pick them up.
//
// Rate limit: OpenMHz is unauthenticated but a single dashboard
// user can pull thousands of calls/min if not careful. We default
// the `since` cursor to "last 15 min" when no high water mark exists
// and skip the `time` param entirely for a cold start to avoid
// hammering the index.

import type { NewLiveIncident } from "@caltrans/db";

export const SCANNER_CALLS_SOURCE = "scanner_calls";
export const OPENMHZ_SFPD_SYSTEM = "sfpdmac";
export const OPENMHZ_API_BASE = "https://api.openmhz.com";

interface OpenMHzCallRow {
  _id?: string;
  time?: string;
  len?: number;
  freq?: number;
  talkgroupNum?: number;
  talkgroupTag?: string;
  talkgroupGroup?: string;
  talkgroupDescription?: string;
  srcList?: { src: number; time: number }[];
  url?: string;
}

interface OpenMHzResponse {
  calls?: OpenMHzCallRow[];
}

export interface ScannerCallsDeps {
  fetch: typeof globalThis.fetch;
  /** Override OpenMHz API base (tests). */
  apiBase?: string;
  /** Override the system shortname (tests). */
  system?: string;
}

export interface ScannerCallsOptions {
  /** Only fetch calls strictly newer than this ISO timestamp. */
  since?: string;
  /** Defensive cap (drop calls past this — protects against clock skew). */
  limit?: number;
}

function parseTimestamp(raw: string | undefined): Date | null {
  if (!raw) return null;
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? null : d;
}

// Talkgroup tag -> severity heuristic. Most SFPD tactical channels
// carry routine traffic; the "Citywide" and "Special Event" channels
// trend higher-priority. Without geo we can't be precise, so we keep
// the bar low: only flag clearly-urgent tags as high.
function severityForTalkgroup(tag: string | undefined): "low" | "med" | "high" {
  const t = (tag ?? "").toLowerCase();
  if (
    t.includes("citywide-1") ||
    t.includes("emergency") ||
    t.includes("pursuit") ||
    t.includes("shooting") ||
    t.includes("officer down")
  ) {
    return "high";
  }
  if (t.includes("citywide") || t.includes("dispatch") || t.includes("tac"))
    return "med";
  return "low";
}

export async function fetchScannerCalls(
  deps: ScannerCallsDeps,
  opts: ScannerCallsOptions = {},
): Promise<{ rows: NewLiveIncident[]; highWaterMark: Date | null }> {
  const apiBase = deps.apiBase ?? OPENMHZ_API_BASE;
  const system = deps.system ?? OPENMHZ_SFPD_SYSTEM;
  const url = new URL(`${apiBase}/${system}/calls/newer`);
  // OpenMHz expects `time` as a unix ms timestamp; calls strictly newer
  // than this are returned. We omit the param on cold start to let the
  // server pick a sensible recent window.
  if (opts.since) {
    const t = new Date(opts.since).getTime();
    if (Number.isFinite(t)) url.searchParams.set("time", String(t));
  }

  const res = await deps.fetch(url.toString(), {
    headers: { accept: "application/json" },
  });
  if (!res.ok) {
    throw new Error(
      `OpenMHz scanner fetch failed: ${res.status} ${res.statusText}`,
    );
  }
  const data = (await res.json()) as OpenMHzResponse;
  const list = data.calls ?? [];

  const rows: NewLiveIncident[] = [];
  let highWaterMark: Date | null = null;
  let count = 0;
  for (const c of list) {
    if (opts.limit && count >= opts.limit) break;
    if (!c._id) continue;
    const occurredAt = parseTimestamp(c.time);
    if (!occurredAt) continue;

    const title = c.talkgroupTag?.trim() || "Scanner call";
    const subtitleParts: string[] = [];
    if (c.talkgroupGroup) subtitleParts.push(c.talkgroupGroup);
    if (c.talkgroupDescription) subtitleParts.push(c.talkgroupDescription);
    if (c.len != null) subtitleParts.push(`${c.len}s`);

    rows.push({
      source: SCANNER_CALLS_SOURCE,
      sourceUid: c._id,
      kind: "scanner",
      title,
      subtitle: subtitleParts.join(" · ") || null,
      severity: severityForTalkgroup(c.talkgroupTag),
      priority: c.talkgroupNum != null ? String(c.talkgroupNum) : null,
      status: null,
      // Scanner calls do not carry geo; cockpit renders these as a
      // bare feed row, not a map pin.
      lat: null,
      lng: null,
      geoPrecision: "unknown",
      neighborhood: null,
      address: null,
      occurredAt,
      raw: c as Record<string, unknown>,
    });
    count++;

    if (!highWaterMark || occurredAt > highWaterMark) {
      highWaterMark = occurredAt;
    }
  }
  return { rows, highWaterMark };
}
