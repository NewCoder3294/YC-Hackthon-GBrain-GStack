import { NextResponse, type NextRequest } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ALLOWED_HOSTS = new Set([
  "wzmedia.dot.ca.gov",
  "cwwp2.dot.ca.gov",
]);

function isAllowed(target: URL): boolean {
  return ALLOWED_HOSTS.has(target.hostname);
}

function proxyUrl(target: URL, origin: string): string {
  return `${origin}/api/hls?url=${encodeURIComponent(target.toString())}`;
}

function rewriteManifest(body: string, target: URL, origin: string): string {
  return body
    .split(/\r?\n/)
    .map((line) => {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) {
        // Rewrite URI="..." inside #EXT-X-KEY, #EXT-X-MAP, etc.
        return line.replace(/URI="([^"]+)"/g, (_m, uri) => {
          try {
            const abs = new URL(uri, target);
            if (!isAllowed(abs)) return `URI="${uri}"`;
            return `URI="${proxyUrl(abs, origin)}"`;
          } catch {
            return `URI="${uri}"`;
          }
        });
      }
      try {
        const abs = new URL(trimmed, target);
        if (!isAllowed(abs)) return line;
        return proxyUrl(abs, origin);
      } catch {
        return line;
      }
    })
    .join("\n");
}

// Short-lived in-memory manifest cache. The same .m3u8 is requested by every
// open tile on the wall; without coalescing we hammer Caltrans with ~N
// duplicate fetches per refresh interval. TTL is well under the segment
// duration so latency vs. freshness stays balanced.
const MANIFEST_TTL_MS = 8_000;
const manifestCache = new Map<string, { body: string; expiresAt: number }>();
const inflight = new Map<string, Promise<string>>();

async function fetchManifest(target: URL): Promise<string> {
  const key = target.toString();
  const now = Date.now();
  const hit = manifestCache.get(key);
  if (hit && hit.expiresAt > now) return hit.body;

  const pending = inflight.get(key);
  if (pending) return pending;

  const p = (async () => {
    const upstream = await fetch(key, {
      headers: { accept: "*/*", "user-agent": "caltrans-cctv-proxy" },
      cache: "no-store",
    });
    if (!upstream.ok) {
      throw new Error(`upstream ${upstream.status}`);
    }
    const body = await upstream.text();
    manifestCache.set(key, { body, expiresAt: Date.now() + MANIFEST_TTL_MS });
    return body;
  })();
  inflight.set(key, p);
  try {
    return await p;
  } finally {
    inflight.delete(key);
  }
}

export async function GET(request: NextRequest) {
  const url = request.nextUrl.searchParams.get("url");
  if (!url) {
    return NextResponse.json({ error: "missing url" }, { status: 400 });
  }

  let target: URL;
  try {
    target = new URL(url);
  } catch {
    return NextResponse.json({ error: "invalid url" }, { status: 400 });
  }

  if (!isAllowed(target)) {
    return NextResponse.json({ error: "host not allowed" }, { status: 403 });
  }

  const isManifest =
    target.pathname.endsWith(".m3u8") ||
    target.pathname.endsWith(".M3U8");

  const origin = `${request.nextUrl.protocol}//${request.nextUrl.host}`;
  const headers = new Headers();
  headers.set("access-control-allow-origin", "*");

  if (isManifest) {
    let body: string;
    try {
      body = await fetchManifest(target);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "upstream error";
      return NextResponse.json({ error: msg }, { status: 502 });
    }
    const rewritten = rewriteManifest(body, target, origin);
    headers.set("content-type", "application/vnd.apple.mpegurl");
    headers.set("cache-control", `public, max-age=${Math.floor(MANIFEST_TTL_MS / 1000)}`);
    return new NextResponse(rewritten, { status: 200, headers });
  }

  const upstream = await fetch(target.toString(), {
    headers: { accept: "*/*", "user-agent": "caltrans-cctv-proxy" },
    cache: "no-store",
  });

  if (!upstream.ok || !upstream.body) {
    return NextResponse.json(
      { error: `upstream ${upstream.status}` },
      { status: upstream.status || 502 },
    );
  }

  const contentType = upstream.headers.get("content-type") ?? "";
  if (contentType) headers.set("content-type", contentType);
  headers.set("cache-control", "no-store");
  return new NextResponse(upstream.body, { status: 200, headers });
}

export function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      "access-control-allow-origin": "*",
      "access-control-allow-methods": "GET, OPTIONS",
    },
  });
}
