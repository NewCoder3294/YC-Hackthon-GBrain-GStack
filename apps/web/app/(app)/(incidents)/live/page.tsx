import {
  listLiveIncidents,
  listDistinctNeighborhoods,
  type LiveFilters,
} from "./data";
import { LiveFilters as LiveFiltersUI } from "./filters";
import { LiveTable } from "./live-table";
import { RealtimeRefresh } from "@/components/kg/realtime-refresh";
import type {
  LiveIncidentSource,
  LiveIncidentSeverity,
} from "@/lib/live-incidents";

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

const SINCE_MS: Record<string, number> = {
  "1h": 60 * 60_000,
  "6h": 6 * 60 * 60_000,
  "24h": 24 * 60 * 60_000,
  "7d": 7 * 24 * 60 * 60_000,
};

const SOURCE_VALUES = new Set<LiveIncidentSource>([
  "sfpd_cad",
  "sf_fire_ems",
  "sf_311",
  "sfpd_reports",
  "511_traffic",
  "511_transit",
]);

const SEVERITY_VALUES = new Set<LiveIncidentSeverity>(["low", "med", "high"]);

function asSource(raw: string | undefined): LiveIncidentSource | undefined {
  if (raw && (SOURCE_VALUES as Set<string>).has(raw)) return raw as LiveIncidentSource;
  return undefined;
}

function asSeverity(raw: string | undefined): LiveIncidentSeverity | undefined {
  if (raw && (SEVERITY_VALUES as Set<string>).has(raw))
    return raw as LiveIncidentSeverity;
  return undefined;
}

function parseFilters(raw: Record<string, string | string[] | undefined>): LiveFilters {
  const get = (k: string) => {
    const v = raw[k];
    return typeof v === "string" && v.length > 0 ? v : undefined;
  };
  const result: LiveFilters = {};
  const source = asSource(get("source"));
  const severity = asSeverity(get("severity"));
  const neighborhood = get("neighborhood");
  const q = get("q");
  const since = get("since");
  const ack = get("ack");
  if (source) result.source = source;
  if (severity) result.severity = severity;
  if (neighborhood) result.neighborhood = neighborhood;
  if (q) result.q = q;
  if (ack === "1") result.unacknowledgedOnly = true;
  if (since && SINCE_MS[since])
    result.since = new Date(Date.now() - SINCE_MS[since]!).toISOString();
  return result;
}

export default async function LivePage({ searchParams }: PageProps) {
  const raw = await searchParams;
  const filters = parseFilters(raw);
  const [rows, neighborhoods] = await Promise.all([
    listLiveIncidents(filters),
    listDistinctNeighborhoods(),
  ]);

  return (
    <section className="relative flex h-full flex-col">
      <RealtimeRefresh channelName="live-feed" />
      <header className="flex items-center justify-between border-b border-neutral-200 px-4 py-3">
        <div className="flex items-baseline gap-3">
          <h1 className="font-mono text-sm uppercase tracking-widest inline-flex items-center gap-2">
            <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-black shadow-[0_0_6px_rgba(0,0,0,0.6)]" />
            <span>
              <span className="border-b-2 border-black pb-0.5">Live</span> · SF
            </span>
          </h1>
          <span className="font-mono text-xs text-neutral-500">
            {rows.length} {rows.length === 1 ? "result" : "results"}
          </span>
        </div>
      </header>

      <LiveFiltersUI neighborhoods={neighborhoods} />

      <LiveTable rows={rows} />
    </section>
  );
}
