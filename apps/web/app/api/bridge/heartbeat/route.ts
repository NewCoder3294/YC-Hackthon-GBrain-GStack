import { NextResponse, type NextRequest } from "next/server";
import {
  getBridgeByDeviceToken,
  touchBridgeLastSeen,
} from "@/lib/contribute/bridge";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Cheap liveness ping — the app POSTs here every ~30s while the user has
// the app open and every 10 min in background mode. We just update
// last_seen_at; the dashboard's "online/offline" indicator reads that.
export async function POST(request: NextRequest) {
  const auth = request.headers.get("authorization") ?? "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : null;
  if (!token) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const bridge = await getBridgeByDeviceToken(token);
  if (!bridge) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  await touchBridgeLastSeen(bridge.id);
  return NextResponse.json({ ok: true, bridge_id: bridge.id });
}
