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
  const isManifest =
    target.pathname.endsWith(".m3u8") ||
    contentType.includes("mpegurl") ||
    contentType.includes("application/x-mpegurl");

  const origin = `${request.nextUrl.protocol}//${request.nextUrl.host}`;
  const headers = new Headers();
  headers.set("access-control-allow-origin", "*");
  headers.set("cache-control", "no-store");

  if (isManifest) {
    const body = await upstream.text();
    const rewritten = rewriteManifest(body, target, origin);
    headers.set("content-type", "application/vnd.apple.mpegurl");
    return new NextResponse(rewritten, { status: 200, headers });
  }

  // .ts segments and keys — stream through unchanged
  if (contentType) headers.set("content-type", contentType);
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
