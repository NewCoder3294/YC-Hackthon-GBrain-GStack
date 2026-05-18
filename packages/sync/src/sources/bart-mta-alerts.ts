// BART + SFMTA transit disruptions, written as env_signals (kind=transit).
//
// Two upstreams stitched together for one env-layer source:
//
//   1. BART BSA: GET https://api.bart.gov/api/bsa.aspx?cmd=bsa&key=...&json=y
//      The "MW9S-E7SL-26DU-VV8V" sample key is documented as public for
//      low-volume usage. We honor an injectable BART_API_KEY and fall
//      back to the sample. Endpoint returns a flat array of advisories
//      under bsa[].
//
//   2. SFMTA service alerts via 511.org: api.511.org/transit/servicealerts
//      filtered to agency=SF (SF Muni). Reuses the existing SF_511_API_KEY.
//
// Both sources are best-effort: a transient 4xx/5xx from one shouldn't
// kill the other. The fan-out cron handles per-source failure isolation;
// this fetcher just throws on its own upstream failures and lets the
// orchestrator absorb them.
//
// Output shape is env_signals (kind='transit'). Lat/lng is the SF
// downtown anchor — transit alerts don't carry a point — so the map
// layer surfaces them as a single clustered pin set rather than per-stop
// markers. The cockpit panel reads off `subtitle` for the route name.

import type { NewEnvSignal } from "@caltrans/db";
import { SF_CITY_HALL } from "../sf-bounds";

export const BART_MTA_SOURCE = "bart_mta";

const BART_ENDPOINT = "https://api.bart.gov/api/bsa.aspx";
// Per BART API docs, this key is published as a public sample.
const BART_PUBLIC_SAMPLE_KEY = "MW9S-E7SL-26DU-VV8V";

const SFMTA_511_ENDPOINT = "https://api.511.org/transit/servicealerts";

interface BartBsaItem {
  bsa?: string;
  description?: { "#cdata-section"?: string } | string | null;
  type?: string | null;
  posted?: string | null;
  expires?: string | null;
  sms_text?: { "#cdata-section"?: string } | string | null;
}

interface BartResponse {
  root?: {
    date?: string;
    time?: string;
    bsa?: BartBsaItem | BartBsaItem[];
    message?: string | { warning?: string; error?: { details?: string } };
  };
}

interface SfmtaSituation {
  Id?: string;
  Severity?: string;
  CreationTime?: string;
  EffectPeriods?: { Start?: string; End?: string }[];
  HeaderText?: { Translations?: { Text?: string; Language?: string }[] };
  DescriptionText?: { Translations?: { Text?: string; Language?: string }[] };
  Effect?: string;
  InformedEntities?: {
    InformedEntity?: { RouteId?: string; RouteName?: string }[];
  };
}

interface SfmtaResponse {
  Siri?: {
    ServiceDelivery?: {
      SituationExchangeDelivery?: {
        Situations?: { PtSituationElement?: SfmtaSituation[] };
      }[];
    };
  };
}

export interface BartMtaDeps {
  fetch?: typeof globalThis.fetch;
  bartApiKey?: string | undefined;
  sf511ApiKey?: string | undefined;
  now?: () => Date;
}

export interface BartMtaResult {
  attempted: number;
  rows: NewEnvSignal[];
  dropped: number;
  bartFetched: number;
  sfmtaFetched: number;
}

function cdata(value: unknown): string {
  if (value == null) return "";
  if (typeof value === "string") return value.trim();
  if (typeof value === "object" && value !== null) {
    const c = (value as { "#cdata-section"?: string })["#cdata-section"];
    if (typeof c === "string") return c.trim();
  }
  return "";
}

function pickEnglish(
  block: { Translations?: { Text?: string; Language?: string }[] } | undefined,
): string {
  const t = block?.Translations ?? [];
  const en = t.find((x) => x.Language?.toLowerCase().startsWith("en"));
  return (en?.Text ?? t[0]?.Text ?? "").trim();
}

function bartSeverity(type: string | null | undefined): "low" | "med" | "high" {
  const t = (type ?? "").toLowerCase();
  if (/(major|severe|emergency|closed)/.test(t)) return "high";
  if (/(delay|elevator|escalator)/.test(t)) return "med";
  return "low";
}

function sfmtaSeverity(raw: string | undefined): "low" | "med" | "high" {
  const s = (raw ?? "").toLowerCase();
  if (s === "severe" || s === "verysevere") return "high";
  if (s === "slight" || s === "veryslight" || s === "noimpact") return "low";
  return "med";
}

async function fetchBart(deps: BartMtaDeps, now: Date): Promise<{
  rows: NewEnvSignal[];
  attempted: number;
  dropped: number;
}> {
  const fetchFn = deps.fetch ?? fetch;
  const key = deps.bartApiKey ?? process.env.BART_API_KEY ?? BART_PUBLIC_SAMPLE_KEY;
  const params = new URLSearchParams({ cmd: "bsa", key, json: "y" });
  const res = await fetchFn(`${BART_ENDPOINT}?${params.toString()}`);
  if (!res.ok) {
    throw new Error(`bart_bsa ${res.status}: ${await res.text()}`);
  }
  const body = (await res.json()) as BartResponse;
  const raw = body.root?.bsa;
  // BART can return a single object instead of an array when there's
  // only one advisory (or even an empty object when none).
  const items: BartBsaItem[] = Array.isArray(raw) ? raw : raw ? [raw] : [];

  const rows: NewEnvSignal[] = [];
  let dropped = 0;
  for (const item of items) {
    const desc = cdata(item.description);
    if (!desc) {
      // BART surfaces "No delays reported" as an empty/sentinel row.
      dropped += 1;
      continue;
    }
    const postedRaw = item.posted ?? "";
    const occurredAt = postedRaw ? new Date(postedRaw) : now;
    const occurred = Number.isNaN(occurredAt.getTime()) ? now : occurredAt;
    const expiresRaw = item.expires ?? null;
    const expiresAt = expiresRaw ? new Date(expiresRaw) : null;
    const expires = expiresAt && !Number.isNaN(expiresAt.getTime()) ? expiresAt : null;

    // BART advisories don't carry a stable uid — combine type + posted +
    // a hash slice of the description for idempotency.
    const sourceUid =
      `bart-${(item.type ?? "bsa").toLowerCase()}-${postedRaw}-${desc.slice(0, 32)}`;

    rows.push({
      kind: "transit",
      source: BART_MTA_SOURCE,
      sourceUid,
      lat: SF_CITY_HALL.lat,
      lng: SF_CITY_HALL.lng,
      severity: bartSeverity(item.type),
      title: `BART · ${item.type ?? "Advisory"}`,
      subtitle: desc.slice(0, 200),
      occurredAt: occurred,
      expiresAt: expires,
      raw: item as unknown as Record<string, unknown>,
    });
  }
  return { rows, attempted: items.length, dropped };
}

async function fetchSfmta(deps: BartMtaDeps, now: Date): Promise<{
  rows: NewEnvSignal[];
  attempted: number;
  dropped: number;
}> {
  const apiKey = deps.sf511ApiKey ?? process.env.SF_511_API_KEY;
  if (!apiKey) {
    // 511 alerts are gated on the existing SF_511_API_KEY. Without it
    // we degrade quietly.
    return { rows: [], attempted: 0, dropped: 0 };
  }
  const fetchFn = deps.fetch ?? fetch;
  const params = new URLSearchParams({
    api_key: apiKey,
    agency: "SF",
    format: "json",
  });
  const res = await fetchFn(`${SFMTA_511_ENDPOINT}?${params.toString()}`);
  if (!res.ok) {
    throw new Error(`sfmta_511 ${res.status}: ${await res.text()}`);
  }
  // 511 wraps responses in a UTF-8 BOM occasionally.
  const text = (await res.text()).replace(/^﻿/, "");
  let body: SfmtaResponse;
  try {
    body = JSON.parse(text) as SfmtaResponse;
  } catch {
    return { rows: [], attempted: 0, dropped: 0 };
  }

  const situations =
    body.Siri?.ServiceDelivery?.SituationExchangeDelivery?.flatMap(
      (s) => s.Situations?.PtSituationElement ?? [],
    ) ?? [];

  const rows: NewEnvSignal[] = [];
  let dropped = 0;
  for (const s of situations) {
    if (!s.Id) {
      dropped += 1;
      continue;
    }
    const header = pickEnglish(s.HeaderText) || "SFMTA Service Alert";
    const description = pickEnglish(s.DescriptionText);
    const period = s.EffectPeriods?.[0];
    const occurredAt = period?.Start
      ? new Date(period.Start)
      : s.CreationTime
        ? new Date(s.CreationTime)
        : now;
    const occurred = Number.isNaN(occurredAt.getTime()) ? now : occurredAt;
    const expiresAt = period?.End ? new Date(period.End) : null;
    const expires = expiresAt && !Number.isNaN(expiresAt.getTime()) ? expiresAt : null;

    const routes =
      s.InformedEntities?.InformedEntity?.map(
        (ie) => ie.RouteName ?? ie.RouteId,
      ).filter(Boolean) ?? [];
    const routeSummary = routes.slice(0, 4).join(", ");
    const subtitle = [routeSummary, description].filter(Boolean).join(" · ");

    rows.push({
      kind: "transit",
      source: BART_MTA_SOURCE,
      sourceUid: `sfmta-${s.Id}`,
      lat: SF_CITY_HALL.lat,
      lng: SF_CITY_HALL.lng,
      severity: sfmtaSeverity(s.Severity),
      title: `SFMTA · ${header}`.slice(0, 160),
      subtitle: subtitle ? subtitle.slice(0, 200) : null,
      occurredAt: occurred,
      expiresAt: expires,
      raw: s as unknown as Record<string, unknown>,
    });
  }
  return { rows, attempted: situations.length, dropped };
}

export async function fetchBartMtaAlerts(
  deps: BartMtaDeps = {},
): Promise<BartMtaResult> {
  const now = deps.now ? deps.now() : new Date();
  const [bart, sfmta] = await Promise.allSettled([
    fetchBart(deps, now),
    fetchSfmta(deps, now),
  ]);

  const rows: NewEnvSignal[] = [];
  let attempted = 0;
  let dropped = 0;
  let bartFetched = 0;
  let sfmtaFetched = 0;

  if (bart.status === "fulfilled") {
    rows.push(...bart.value.rows);
    attempted += bart.value.attempted;
    dropped += bart.value.dropped;
    bartFetched = bart.value.rows.length;
  } else {
    // Surface the BART failure to the orchestrator by re-throwing only
    // if both sides failed; otherwise log via raw for visibility.
    if (sfmta.status === "rejected") {
      throw new Error(
        `bart_mta both upstreams failed: bart=${
          bart.reason instanceof Error ? bart.reason.message : "unknown"
        }; sfmta=${
          sfmta.reason instanceof Error ? sfmta.reason.message : "unknown"
        }`,
      );
    }
  }

  if (sfmta.status === "fulfilled") {
    rows.push(...sfmta.value.rows);
    attempted += sfmta.value.attempted;
    dropped += sfmta.value.dropped;
    sfmtaFetched = sfmta.value.rows.length;
  }

  return { attempted, rows, dropped, bartFetched, sfmtaFetched };
}
