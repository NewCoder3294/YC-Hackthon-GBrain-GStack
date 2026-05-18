import { describe, it, expect, vi } from "vitest";
import {
  fetchNewsRss,
  parseRss,
  classifyCrime,
  geocodeFromText,
} from "./news-rss";

function rssXml(items: { title: string; link: string; description: string; pubDate: string }[]) {
  const body = items
    .map(
      (i) => `
    <item>
      <title><![CDATA[${i.title}]]></title>
      <link>${i.link}</link>
      <description><![CDATA[${i.description}]]></description>
      <pubDate>${i.pubDate}</pubDate>
    </item>`,
    )
    .join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0"><channel>${body}</channel></rss>`;
}

function rssResponse(xml: string): typeof globalThis.fetch {
  return vi
    .fn()
    .mockResolvedValue(new Response(xml, { status: 200 })) as never;
}

describe("classifyCrime", () => {
  it("matches the most-specific rule first", () => {
    expect(classifyCrime("Fatal shooting in the Mission")?.type).toBe(
      "homicide",
    );
  });
  it("returns null for non-crime headlines", () => {
    expect(classifyCrime("New bakery opens in Hayes Valley")).toBeNull();
  });
});

describe("geocodeFromText", () => {
  it("finds Mission neighborhood via centroid", () => {
    const got = geocodeFromText("A stabbing in the Mission overnight");
    expect(got?.name).toBe("Mission");
    expect(got?.lat).toBeCloseTo(37.7599, 3);
  });

  it("returns null when no SF neighborhood is mentioned", () => {
    expect(geocodeFromText("Berkeley man arrested in robbery")).toBeNull();
  });
});

describe("parseRss", () => {
  it("extracts items with CDATA-wrapped titles + descriptions", () => {
    const xml = rssXml([
      {
        title: "Test headline",
        link: "https://example.com/1",
        description: "<p>Body text</p>",
        pubDate: "Sat, 18 May 2026 12:00:00 GMT",
      },
    ]);
    const items = parseRss(xml);
    expect(items).toHaveLength(1);
    expect(items[0]?.title).toBe("Test headline");
    expect(items[0]?.link).toBe("https://example.com/1");
  });
});

describe("fetchNewsRss", () => {
  it("ingests a crime article tied to a known SF neighborhood", async () => {
    const xml = rssXml([
      {
        title: "Homicide reported in the Tenderloin overnight",
        link: "https://missionlocal.org/2026/05/tenderloin-homicide/",
        description:
          "SFPD responded to a fatal shooting near Eddy and Larkin streets in the Tenderloin.",
        pubDate: "Sat, 18 May 2026 12:00:00 GMT",
      },
    ]);
    const fetch = rssResponse(xml);
    const { rows, highWaterMark } = await fetchNewsRss({
      fetch,
      feeds: [{ source: "Mission Local", url: "https://x/feed/" }],
    });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      source: "Mission Local",
      crimeType: "homicide",
      severity: "high",
      neighborhood: "Tenderloin",
    });
    expect(highWaterMark?.toISOString()).toBe("2026-05-18T12:00:00.000Z");
  });

  it("skips articles with no crime keyword", async () => {
    const xml = rssXml([
      {
        title: "New bakery opens in the Mission",
        link: "https://x/1",
        description: "Sourdough loaves all day.",
        pubDate: "Sat, 18 May 2026 12:00:00 GMT",
      },
    ]);
    const { rows } = await fetchNewsRss({
      fetch: rssResponse(xml),
      feeds: [{ source: "X", url: "https://x/" }],
    });
    expect(rows).toHaveLength(0);
  });

  it("skips crime articles with no SF neighborhood match", async () => {
    const xml = rssXml([
      {
        title: "Shooting in Oakland leaves one injured",
        link: "https://x/1",
        description: "Police investigate gunfire near downtown Oakland.",
        pubDate: "Sat, 18 May 2026 12:00:00 GMT",
      },
    ]);
    const { rows } = await fetchNewsRss({
      fetch: rssResponse(xml),
      feeds: [{ source: "X", url: "https://x/" }],
    });
    expect(rows).toHaveLength(0);
  });

  it("respects the `since` cutoff", async () => {
    const xml = rssXml([
      {
        title: "Stabbing in the Mission",
        link: "https://x/old",
        description: "A stabbing was reported in the Mission.",
        pubDate: "Sat, 10 May 2026 12:00:00 GMT",
      },
      {
        title: "Robbery in the Castro",
        link: "https://x/new",
        description: "An armed robbery in the Castro.",
        pubDate: "Sat, 17 May 2026 12:00:00 GMT",
      },
    ]);
    const { rows } = await fetchNewsRss(
      {
        fetch: rssResponse(xml),
        feeds: [{ source: "X", url: "https://x/" }],
      },
      { since: "2026-05-15T00:00:00.000Z" },
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]?.sourceUrl).toBe("https://x/new");
  });

  it("dedupes by source_url across feeds", async () => {
    const xml = rssXml([
      {
        title: "Shooting in the Mission",
        link: "https://shared/url",
        description: "Gunfire near Mission and 24th.",
        pubDate: "Sat, 18 May 2026 12:00:00 GMT",
      },
    ]);
    const { rows } = await fetchNewsRss({
      fetch: rssResponse(xml),
      feeds: [
        { source: "Feed A", url: "https://a/" },
        { source: "Feed B", url: "https://b/" },
      ],
    });
    expect(rows).toHaveLength(1);
  });

  it("isolates a failing feed (Promise.allSettled)", async () => {
    const okXml = rssXml([
      {
        title: "Stabbing in the Mission",
        link: "https://ok/1",
        description: "A stabbing was reported in the Mission.",
        pubDate: "Sat, 18 May 2026 12:00:00 GMT",
      },
    ]);
    const fetch = vi.fn(async (url) => {
      if (String(url).includes("bad")) {
        return new Response("nope", { status: 500 });
      }
      return new Response(okXml, { status: 200 });
    }) as never;
    const { rows } = await fetchNewsRss({
      fetch,
      feeds: [
        { source: "OK", url: "https://ok/feed" },
        { source: "BAD", url: "https://bad/feed" },
      ],
    });
    expect(rows).toHaveLength(1);
    expect(rows[0]?.source).toBe("OK");
  });
});
