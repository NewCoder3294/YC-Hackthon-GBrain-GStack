import "server-only";
import { createClient } from "@/lib/supabase/server";
import { FeedClient, type FeedItem } from "./feed-client";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function FeedPage() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("news_incidents")
    .select(
      "id, source, source_url, title, summary, crime_type, severity, neighborhood, address, lat, lng, published_at",
    )
    .order("published_at", { ascending: false })
    .limit(500);

  if (error) {
    return (
      <section className="p-6">
        <h1 className="font-mono text-sm uppercase tracking-widest">Feed</h1>
        <p className="mt-2 font-mono text-xs text-neutral-500">
          Failed to load news feed: {error.message}
        </p>
      </section>
    );
  }

  const items: FeedItem[] = (data ?? []).map((r) => ({
    id: r.id as string,
    source: r.source as string,
    sourceUrl: (r.source_url as string | null) ?? null,
    title: r.title as string,
    summary: (r.summary as string | null) ?? null,
    crimeType: r.crime_type as string,
    severity: r.severity as "low" | "med" | "high",
    neighborhood: (r.neighborhood as string | null) ?? null,
    address: (r.address as string | null) ?? null,
    lat: r.lat as number,
    lng: r.lng as number,
    publishedAt: r.published_at as string,
  }));

  return <FeedClient items={items} />;
}
