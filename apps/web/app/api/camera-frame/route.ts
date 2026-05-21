import { NextResponse, type NextRequest } from "next/server";
import { fetchValidatedImageFrame } from "@/lib/cameras/validate";
import {
  RATE_LIMITS,
  checkRateLimit,
  rateLimitResponse,
  withRateLimitHeaders,
} from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ALLOWED_HOSTS = new Set(["cwwp2.dot.ca.gov"]);

export async function GET(request: NextRequest) {
  const rate = await checkRateLimit(request, RATE_LIMITS.imageFrame);
  if (!rate.allowed) return rateLimitResponse(rate);

  const rawUrl = request.nextUrl.searchParams.get("url");
  if (!rawUrl) {
    return NextResponse.json({ error: "missing_url" }, { status: 400 });
  }

  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return NextResponse.json({ error: "invalid_url" }, { status: 400 });
  }

  if (url.protocol !== "https:" || !ALLOWED_HOSTS.has(url.hostname)) {
    return NextResponse.json({ error: "blocked_host" }, { status: 403 });
  }

  const frame = await fetchValidatedImageFrame(url.toString(), "caltrans", fetch);
  if (frame.status !== "ok" || !frame.bytes) {
    return NextResponse.json(
      { error: frame.error ?? "invalid_frame" },
      {
        status: 404,
        headers: {
          "cache-control": "no-store",
        },
      },
    );
  }

  return withRateLimitHeaders(
    new Response(new Uint8Array(frame.bytes), {
      headers: {
        "content-type": frame.contentType ?? "image/jpeg",
        "cache-control": "no-store",
        "x-watchdog-frame-status": "ok",
      },
    }),
    rate,
  );
}
