import { NextResponse, type NextRequest } from "next/server";
import { pairBridge } from "@/lib/contribute/bridge";
import { rateLimit } from "@/lib/contribute/ratelimit";
import { pairRequestSchema } from "@/lib/contribute/bridge-protocol";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Mobile bridge -> server handshake. The app shows the contributor a code
// from /c/[token]/install; they type it into the app; the app calls this
// endpoint to exchange it for a long-lived device_token.

export async function POST(request: NextRequest) {
  const ip =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  // Strict rate limit on pair attempts — pairing codes are short and
  // brute-forceable. 20 attempts per IP per minute lets a real user retry
  // typos a few times but caps an attacker at ~1.7M attempts/day against a
  // 30^6 = 729M keyspace (well under 1% probability over the 10-min TTL).
  if (!rateLimit(`bridge_pair:${ip}`, { limit: 20, windowMs: 60_000 })) {
    return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  }

  const body = await request.json().catch(() => null);
  const parsed = pairRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid_body", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  const result = await pairBridge(
    parsed.data.pairing_code,
    parsed.data.platform,
    parsed.data.app_version ?? null,
  );
  if (!result) {
    // Generic so an attacker can't distinguish expired vs. wrong code.
    return NextResponse.json({ error: "invalid_or_expired" }, { status: 404 });
  }

  return NextResponse.json({
    bridge_id: result.bridgeId,
    device_token: result.deviceToken,
  });
}
