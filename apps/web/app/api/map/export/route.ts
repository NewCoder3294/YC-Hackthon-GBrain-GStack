import { NextResponse, type NextRequest } from "next/server";
import { decodeFilter } from "@/lib/map/filter";
import { loadFilteredIncidents, type FilteredIncidentPin } from "@/lib/map/load";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_ROWS = 1000;

function csvEscape(v: string | number | null | undefined): string {
  if (v === null || v === undefined) return "";
  const s = String(v);
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function toCsv(rows: FilteredIncidentPin[]): string {
  const header = [
    "id",
    "source",
    "title",
    "severity",
    "neighborhood",
    "lat",
    "lng",
    "occurred_at",
  ];
  const lines = [header.join(",")];
  for (const r of rows) {
    lines.push(
      [
        csvEscape(r.id),
        csvEscape(r.source),
        csvEscape(r.title),
        csvEscape(r.severity),
        csvEscape(r.neighborhood),
        r.lat,
        r.lng,
        csvEscape(r.occurredAt),
      ].join(","),
    );
  }
  return lines.join("\n");
}

function toGeoJSON(rows: FilteredIncidentPin[]): string {
  const fc = {
    type: "FeatureCollection" as const,
    features: rows.map((r) => ({
      type: "Feature" as const,
      geometry: { type: "Point" as const, coordinates: [r.lng, r.lat] },
      properties: {
        id: r.id,
        source: r.source,
        title: r.title,
        severity: r.severity,
        neighborhood: r.neighborhood,
        occurred_at: r.occurredAt,
      },
    })),
  };
  return JSON.stringify(fc);
}

/**
 * Streams the currently-filtered map view as CSV or GeoJSON.
 * Reads the same MapFilter query params the page consumes — paste a
 * permalink URL with ?format=csv (or ?format=geojson) appended.
 */
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const format = (params.get("format") ?? "csv").toLowerCase();
  if (format !== "csv" && format !== "geojson") {
    return NextResponse.json(
      { error: "format must be 'csv' or 'geojson'" },
      { status: 400 },
    );
  }
  // decodeFilter expects a URLSearchParams-like; trim the format key.
  const filterParams = new URLSearchParams(params);
  filterParams.delete("format");
  const filter = decodeFilter(filterParams);
  const rows = (await loadFilteredIncidents(filter)).slice(0, MAX_ROWS);

  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  if (format === "csv") {
    return new NextResponse(toCsv(rows), {
      headers: {
        "content-type": "text/csv; charset=utf-8",
        "content-disposition": `attachment; filename="watchdog-${stamp}.csv"`,
      },
    });
  }
  return new NextResponse(toGeoJSON(rows), {
    headers: {
      "content-type": "application/geo+json",
      "content-disposition": `attachment; filename="watchdog-${stamp}.geojson"`,
    },
  });
}
