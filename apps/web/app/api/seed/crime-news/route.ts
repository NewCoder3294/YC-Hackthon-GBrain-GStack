import { NextResponse, type NextRequest } from "next/server";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { createDb, newsIncidents, sql } from "@caltrans/db";
import { env } from "@/lib/env";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface SeedRow {
  source: string;
  source_url: string;
  title: string;
  summary: string;
  crime_type: string;
  severity: "low" | "med" | "high";
  neighborhood: string;
  address: string;
  lat: number;
  lng: number;
  published_at: string;
}

export async function POST(request: NextRequest) {
  const auth = request.headers.get("authorization");
  if (!env.CRON_SECRET || auth !== `Bearer ${env.CRON_SECRET}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  if (!env.DATABASE_URL) {
    return NextResponse.json({ error: "DATABASE_URL not set" }, { status: 500 });
  }

  const seedPath = path.join(
    process.cwd(),
    "..",
    "..",
    "packages",
    "db",
    "seed-data",
    "sf-crime-news.json",
  );

  let raw: string;
  try {
    raw = await readFile(seedPath, "utf8");
  } catch {
    return NextResponse.json(
      { error: `seed file missing at ${seedPath}` },
      { status: 500 },
    );
  }

  const rows = JSON.parse(raw) as SeedRow[];
  const db = createDb(env.DATABASE_URL);

  const values = rows.map((r) => ({
    source: r.source,
    sourceUrl: r.source_url || null,
    title: r.title,
    summary: r.summary,
    crimeType: r.crime_type,
    severity: r.severity,
    neighborhood: r.neighborhood,
    address: r.address,
    lat: r.lat,
    lng: r.lng,
    publishedAt: new Date(r.published_at),
    raw: r as unknown as Record<string, unknown>,
  }));

  // Upsert on source_url where present; rows with null source_url just insert.
  const withUrl = values.filter((v) => v.sourceUrl);
  const withoutUrl = values.filter((v) => !v.sourceUrl);

  let inserted = 0;
  if (withUrl.length > 0) {
    const result = await db
      .insert(newsIncidents)
      .values(withUrl)
      .onConflictDoUpdate({
        target: newsIncidents.sourceUrl,
        set: {
          title: sql`excluded.title`,
          summary: sql`excluded.summary`,
          crimeType: sql`excluded.crime_type`,
          severity: sql`excluded.severity`,
          neighborhood: sql`excluded.neighborhood`,
          address: sql`excluded.address`,
          lat: sql`excluded.lat`,
          lng: sql`excluded.lng`,
          publishedAt: sql`excluded.published_at`,
          raw: sql`excluded.raw`,
        },
      })
      .returning({ id: newsIncidents.id });
    inserted += result.length;
  }
  if (withoutUrl.length > 0) {
    const result = await db
      .insert(newsIncidents)
      .values(withoutUrl)
      .returning({ id: newsIncidents.id });
    inserted += result.length;
  }

  return NextResponse.json({ ok: true, count: inserted });
}
