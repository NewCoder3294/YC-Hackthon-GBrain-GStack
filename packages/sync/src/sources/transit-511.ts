// 511 Regional Transit Service Alerts — `api.511.org/transit/servicealerts`.
//
// One feed serves all Bay Area agencies (SF Muni, BART, Caltrain, Golden
// Gate Transit, AC Transit, SamTrans, etc.). We pass `agency=RG` for the
// combined feed. Alerts have no precise lat/lng — they apply per route
// or per stop. We treat them as SF-relevant when the alert mentions an
// SF-only agency or its informed entities reference an SF route.
//
// Polled every 5 min.

import type { NewLiveIncident } from "@caltrans/db";
import { sf511Fetch, type SF511Deps } from "./sf511-base";
import { SF_CITY_HALL } from "../sf-bounds";

export const TRANSIT_511_SOURCE = "511_transit";

// Agencies that operate primarily within SF — alerts from these are
// always SF-relevant. Others (AC, GG, SM, SC) get filtered by the alert's
// affected stops/routes only.
const SF_PRIMARY_AGENCIES = new Set(["SF", "BA", "CT"]);
// SF Muni, BART (touches SF stations), Caltrain (touches SF stations).

interface TimeRange {
  Start?: string;
  End?: string;
}

interface InformedEntity {
  AgencyId?: string;
  AgencyName?: string;
  RouteId?: string;
  RouteName?: string;
  StopId?: string;
  StopName?: string;
}

interface ServiceAlert {
  Id?: string;
  ServiceAlertVersion?: string | number;
  EffectPeriods?: TimeRange[];
  CreationTime?: string;
  UpdatedTime?: string;
  Cause?: string;
  Effect?: string;
  Severity?: string;
  HeaderText?: { Translations?: { Text?: string; Language?: string }[] };
  DescriptionText?: { Translations?: { Text?: string; Language?: string }[] };
  InformedEntities?: { InformedEntity?: InformedEntity[] };
}

interface AlertsResponse {
  Siri?: {
    ServiceDelivery?: {
      SituationExchangeDelivery?: {
        Situations?: { PtSituationElement?: ServiceAlert[] };
      }[];
    };
  };
  ServiceAlerts?: ServiceAlert[];
}

function pickTranslation(
  block: { Translations?: { Text?: string; Language?: string }[] } | undefined,
): string {
  const t = block?.Translations ?? [];
  const en = t.find((x) => x.Language?.toLowerCase().startsWith("en"));
  return (en?.Text ?? t[0]?.Text ?? "").trim();
}

function parseTs(raw: string | undefined): Date | null {
  if (!raw) return null;
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? null : d;
}

// SIRI Severity values: "noImpact" | "verySlight" | "slight" | "normal"
// | "severe" | "verySevere" | "undefined".
function severityFor(raw: string | undefined): "low" | "med" | "high" {
  const s = (raw ?? "").toLowerCase();
  if (s === "severe" || s === "verysevere") return "high";
  if (s === "slight" || s === "normal") return "med";
  return "low";
}

function entitiesOf(alert: ServiceAlert): InformedEntity[] {
  const wrapper = alert.InformedEntities;
  if (!wrapper?.InformedEntity) return [];
  return Array.isArray(wrapper.InformedEntity)
    ? wrapper.InformedEntity
    : [wrapper.InformedEntity];
}

function isSFRelevant(alert: ServiceAlert): boolean {
  for (const e of entitiesOf(alert)) {
    if (e.AgencyId && SF_PRIMARY_AGENCIES.has(e.AgencyId.toUpperCase())) return true;
  }
  return false;
}

function extractAlerts(data: AlertsResponse): ServiceAlert[] {
  if (data.ServiceAlerts?.length) return data.ServiceAlerts;
  const deliveries = data.Siri?.ServiceDelivery?.SituationExchangeDelivery ?? [];
  const out: ServiceAlert[] = [];
  for (const d of deliveries) {
    const list = d.Situations?.PtSituationElement ?? [];
    out.push(...list);
  }
  return out;
}

export interface Transit511FetchOptions {
  agency?: string;
}

export async function fetchTransit511(
  deps: SF511Deps,
  opts: Transit511FetchOptions = {},
): Promise<{ rows: NewLiveIncident[]; highWaterMark: Date | null }> {
  const params: Record<string, string> = {
    format: "json",
    agency: opts.agency ?? "RG",
  };

  const data = await sf511Fetch<AlertsResponse>(
    "/transit/servicealerts",
    params,
    deps,
  );
  const alerts = extractAlerts(data);

  const rows: NewLiveIncident[] = [];
  let highWaterMark: Date | null = null;
  for (const a of alerts) {
    if (!a.Id) continue;
    if (!isSFRelevant(a)) continue;
    const occurredAt = parseTs(a.CreationTime ?? a.UpdatedTime);
    if (!occurredAt) continue;

    const title =
      pickTranslation(a.HeaderText) ||
      `${a.Cause ?? "Service alert"}${a.Effect ? ` · ${a.Effect}` : ""}`;
    const desc = pickTranslation(a.DescriptionText);
    const entities = entitiesOf(a);
    const routeNames = Array.from(
      new Set(
        entities
          .map((e) => e.RouteName ?? e.RouteId)
          .filter((x): x is string => !!x),
      ),
    ).slice(0, 4);
    const agencies = Array.from(
      new Set(
        entities.map((e) => e.AgencyName ?? e.AgencyId).filter((x): x is string => !!x),
      ),
    );
    const subtitleParts = [agencies.join(", "), routeNames.join(", "), desc.slice(0, 180)].filter(
      Boolean,
    );

    // No precise geo — pin to SF City Hall as a stand-in. Render hollow
    // marker in the map UI for transit-source rows.
    rows.push({
      source: TRANSIT_511_SOURCE,
      sourceUid: String(a.Id),
      kind: "transit",
      title,
      subtitle: subtitleParts.join(" · ") || null,
      severity: severityFor(a.Severity),
      priority: a.Severity ?? null,
      status: a.Effect ?? null,
      lat: SF_CITY_HALL.lat,
      lng: SF_CITY_HALL.lng,
      geoPrecision: "neighborhood",
      neighborhood: null,
      address: routeNames.join(", ") || null,
      occurredAt,
      raw: a as Record<string, unknown>,
    });

    const cursor = parseTs(a.UpdatedTime) ?? occurredAt;
    if (!highWaterMark || cursor > highWaterMark) highWaterMark = cursor;
  }
  return { rows, highWaterMark };
}
