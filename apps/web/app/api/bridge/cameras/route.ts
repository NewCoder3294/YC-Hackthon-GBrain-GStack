import { NextResponse, type NextRequest } from "next/server";
import { adminClient } from "@/lib/supabase/admin";
import {
  getBridgeByDeviceToken,
  touchBridgeLastSeen,
} from "@/lib/contribute/bridge";
import {
  camerasRequestSchema,
  bridgeStreamUrl,
} from "@/lib/contribute/bridge-protocol";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Bridge reports the ONVIF cameras it found on the contributor's LAN. The
// server upserts a `cameras` row per discovered camera with stream_url set
// to `bridge://{bridge_id}/{onvif_path}` so the existing wall/HLS read
// paths don't need to know about bridges; /api/hls dispatches the scheme.
//
// `lat`/`lng` are required because the HLS proxy + correlator both index
// off geo. The phone app should default these to the contributor's
// recorded location and let the owner adjust per-camera.

type LooseClient = {
  from: (
    t: string,
  ) => {
    upsert: (
      row: Record<string, unknown> | Record<string, unknown>[],
      opts?: { onConflict: string },
    ) => Promise<{ error: { message: string } | null }>;
  };
};

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

  const body = await request.json().catch(() => null);
  const parsed = camerasRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid_body", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  const sb = adminClient() as unknown as LooseClient;
  const rows = parsed.data.cameras.map((c, idx) => ({
    caltrans_id: `BRIDGE-${bridge.id.slice(0, 8)}-${idx}`,
    district: 4,
    route: "contributor",
    direction: null,
    description: c.description,
    lat: c.lat,
    lng: c.lng,
    stream_url: bridgeStreamUrl(bridge.id, c.onvif_path),
    stream_type: c.stream_type,
    is_active: true,
    contributor_id: bridge.contributorId,
    bridge_id: bridge.id,
  }));

  const { error } = await sb
    .from("cameras")
    .upsert(rows, { onConflict: "caltrans_id" });
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  await touchBridgeLastSeen(bridge.id);
  return NextResponse.json({ ok: true, inserted: rows.length });
}
