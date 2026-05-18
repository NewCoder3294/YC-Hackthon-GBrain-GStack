import { NextResponse, type NextRequest } from "next/server";
import { getRedis } from "@/lib/cache/redis";
import { parseBridgeStreamUrl } from "@/lib/contribute/bridge-protocol";

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

// Two-tier cache. L1 is per-instance memory (sub-ms hit, scoped to one Fluid
// Compute instance). L2 is Upstash Redis, shared across all instances and
// regions — without it every cold function or scale-out spawns a duplicate
// Caltrans fetch. Manifests are tiny text so we cache them whole; segments
// (.ts/.m4s) are immutable once published and big enough that round-tripping
// through Redis as base64 is still cheaper than re-pulling from Caltrans.
const MANIFEST_TTL_MS = 12_000;
const MANIFEST_REDIS_TTL_S = 15; // slight slop past L1 so stale L1 still beats Caltrans
const MANIFEST_SWR_S = 30;
const SEGMENT_REDIS_TTL_S = 300;
const SEGMENT_MAX_BYTES = 2_000_000; // 2 MB — skip Redis for anything larger

const manifestCache = new Map<string, { body: string; expiresAt: number }>();
const inflightManifest = new Map<string, Promise<string>>();
const inflightSegment = new Map<
  string,
  Promise<{ bytes: Buffer; contentType: string }>
>();

function manifestKey(target: URL): string {
  return `hls:m:${target.toString()}`;
}

function segmentKey(target: URL): string {
  return `hls:s:${target.toString()}`;
}

async function fetchManifest(target: URL): Promise<string> {
  const key = target.toString();
  const now = Date.now();

  const hit = manifestCache.get(key);
  if (hit && hit.expiresAt > now) return hit.body;

  const pending = inflightManifest.get(key);
  if (pending) return pending;

  const p = (async () => {
    const redis = getRedis();
    if (redis) {
      try {
        const cached = await redis.get<string>(manifestKey(target));
        if (cached) {
          manifestCache.set(key, {
            body: cached,
            expiresAt: Date.now() + MANIFEST_TTL_MS,
          });
          return cached;
        }
      } catch {
        // Redis hiccup — fall through to upstream.
      }
    }

    const upstream = await fetch(key, {
      headers: { accept: "*/*", "user-agent": "caltrans-cctv-proxy" },
      cache: "no-store",
    });
    if (!upstream.ok) {
      throw new Error(`upstream ${upstream.status}`);
    }
    const body = await upstream.text();
    manifestCache.set(key, {
      body,
      expiresAt: Date.now() + MANIFEST_TTL_MS,
    });
    if (redis) {
      // Fire-and-forget — don't block the response on Redis write.
      redis
        .set(manifestKey(target), body, { ex: MANIFEST_REDIS_TTL_S })
        .catch(() => {});
    }
    return body;
  })();

  inflightManifest.set(key, p);
  try {
    return await p;
  } finally {
    inflightManifest.delete(key);
  }
}

async function fetchSegment(
  target: URL,
): Promise<{ bytes: Buffer; contentType: string }> {
  const key = target.toString();
  const pending = inflightSegment.get(key);
  if (pending) return pending;

  const p = (async () => {
    const redis = getRedis();
    if (redis) {
      try {
        const cached = await redis.get<{ b: string; t: string }>(
          segmentKey(target),
        );
        if (cached?.b) {
          return {
            bytes: Buffer.from(cached.b, "base64"),
            contentType: cached.t || "application/octet-stream",
          };
        }
      } catch {
        // ignore
      }
    }

    const upstream = await fetch(key, {
      headers: { accept: "*/*", "user-agent": "caltrans-cctv-proxy" },
      cache: "no-store",
    });
    if (!upstream.ok || !upstream.body) {
      throw new Error(`upstream ${upstream.status}`);
    }
    const buf = Buffer.from(await upstream.arrayBuffer());
    const contentType =
      upstream.headers.get("content-type") ?? "application/octet-stream";

    if (redis && buf.byteLength > 0 && buf.byteLength <= SEGMENT_MAX_BYTES) {
      redis
        .set(
          segmentKey(target),
          { b: buf.toString("base64"), t: contentType },
          { ex: SEGMENT_REDIS_TTL_S },
        )
        .catch(() => {});
    }
    return { bytes: buf, contentType };
  })();

  inflightSegment.set(key, p);
  try {
    return await p;
  } finally {
    inflightSegment.delete(key);
  }
}

// Contributor cameras live on a LAN behind their shop's NAT. Their stream
// URL is recorded as `bridge://{bridge_id}/{onvif_path}` — this route
// recognizes that scheme and proxies through the bridge tunnel service.
// The tunnel itself runs out-of-band (persistent WebSocket relays aren't
// a Vercel-function workload); BRIDGE_TUNNEL_URL points at it. When the
// env is unset, return 503 with a clear body so the wall UI can render
// "Camera offline" rather than crashing.
async function dispatchBridge(target: URL): Promise<Response> {
  const tunnelBase = process.env.BRIDGE_TUNNEL_URL;
  if (!tunnelBase) {
    return NextResponse.json(
      { error: "bridge_tunnel_not_configured" },
      { status: 503 },
    );
  }
  // bridge://<bridge_id>/<onvif_path>  →  <tunnel>/relay/<bridge_id>/<onvif_path>
  const parsed = parseBridgeStreamUrl(target.toString());
  if (!parsed) {
    return NextResponse.json(
      { error: "invalid_bridge_url" },
      { status: 400 },
    );
  }
  const relay = new URL(
    `/relay/${encodeURIComponent(parsed.bridgeId)}/${parsed.onvifPath}`,
    tunnelBase,
  );

  const upstream = await fetch(relay.toString(), {
    headers: {
      accept: "*/*",
      "x-bridge-auth": process.env.BRIDGE_TUNNEL_SECRET ?? "",
    },
    cache: "no-store",
  });
  if (!upstream.ok || !upstream.body) {
    return NextResponse.json(
      { error: `tunnel ${upstream.status}` },
      { status: upstream.status || 502 },
    );
  }
  const headers = new Headers();
  headers.set("access-control-allow-origin", "*");
  const ct = upstream.headers.get("content-type");
  if (ct) headers.set("content-type", ct);
  headers.set("cache-control", "no-store");
  return new NextResponse(upstream.body, { status: 200, headers });
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

  // Contributor cameras (phone-as-bridge path) come in as bridge:// URLs.
  // Hand off to the tunnel before the public-host allowlist runs.
  if (target.protocol === "bridge:") {
    return dispatchBridge(target);
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
    const ttlS = Math.floor(MANIFEST_TTL_MS / 1000);
    headers.set(
      "cache-control",
      `public, max-age=${ttlS}, s-maxage=${ttlS}, stale-while-revalidate=${MANIFEST_SWR_S}`,
    );
    return new NextResponse(rewritten, { status: 200, headers });
  }

  const isSegment = /\.(ts|m4s|mp4|aac|key)$/i.test(target.pathname);

  if (isSegment) {
    let seg: { bytes: Buffer; contentType: string };
    try {
      seg = await fetchSegment(target);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "upstream error";
      return NextResponse.json({ error: msg }, { status: 502 });
    }
    headers.set("content-type", seg.contentType);
    // HLS segments are immutable once published — let Vercel's edge serve
    // repeats so we don't re-fetch from Caltrans for every viewer.
    headers.set(
      "cache-control",
      "public, max-age=60, s-maxage=300, stale-while-revalidate=600, immutable",
    );
    // Buffer<ArrayBufferLike> doesn't structurally match BodyInit under TS5
    // strict typing even though the runtime handles it fine.
    return new NextResponse(seg.bytes as unknown as BodyInit, {
      status: 200,
      headers,
    });
  }

  // Anything else (rare) — pass through without caching.
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
