// AIS marine traffic via AISStream.io (websocket).
//
// AISStream.io is a free websocket aggregator of AIS Class A/B vessel
// position reports. Auth: API key sent in the first JSON message after
// the connection opens, alongside a bbox subscription. Docs:
//   https://aisstream.io/documentation
//
// Cron-friendly pattern: open the socket, send the subscription, capture
// position messages for ~10s, then close. Each unique MMSI inside the
// snapshot window is upserted into env_signals as `kind = 'vessel'`.
//
// The fetcher accepts an injected `WebSocketCtor` so tests can swap in
// a fake without spinning up a real socket. Production uses the global
// WebSocket (Node 22 has it built-in).

import type { NewEnvSignal } from "@caltrans/db";
import { SF_BBOX, isInsideSF } from "../sf-bounds";

export const AIS_MARINE_SOURCE = "aisstream";

const AIS_WS_URL = "wss://stream.aisstream.io/v0/stream";

// Slight outer pad for the AIS subscription so we still see ships that
// are about to cross into the SF bbox; filtering happens client-side.
const SUBSCRIPTION_BBOX = [
  [SF_BBOX.minLat - 0.05, SF_BBOX.minLng - 0.05],
  [SF_BBOX.maxLat + 0.05, SF_BBOX.maxLng + 0.05],
] as const;

interface AisPositionReport {
  Cog?: number;
  Latitude?: number;
  Longitude?: number;
  Sog?: number;
  TrueHeading?: number;
  UserID?: number; // MMSI
}

interface AisMetaData {
  MMSI?: number;
  ShipName?: string;
  latitude?: number;
  longitude?: number;
  time_utc?: string;
}

interface AisMessage {
  MessageType?: string;
  MetaData?: AisMetaData;
  Message?: {
    PositionReport?: AisPositionReport;
    ShipStaticData?: { Name?: string; Type?: number };
  };
}

export interface AisDeps {
  apiKey?: string | undefined;
  WebSocketCtor?: typeof globalThis.WebSocket;
  now?: () => Date;
  /** Snapshot duration in ms. Production cron uses ~10s. */
  durationMs?: number;
}

export interface AisResult {
  attempted: number;
  rows: NewEnvSignal[];
  dropped: number;
  disabled?: boolean;
}

// Heuristic severity: large vessels (commercial > 100m, tankers, cargo)
// matter more than fishing boats. AIS reports don't always include
// dimensions, so default low + bump to med if name suggests cargo.
function vesselSeverity(name: string | null): "low" | "med" | "high" {
  if (!name) return "low";
  const n = name.toUpperCase();
  if (/TANKER|CRUDE|LNG|LPG/.test(n)) return "high";
  if (/CONTAINER|CARGO|BULK|CRUISE|FERRY/.test(n)) return "med";
  return "low";
}

interface PendingVessel {
  mmsi: number;
  name: string | null;
  lat: number;
  lng: number;
  sogKn: number | null;
  cog: number | null;
  occurredAt: Date;
}

export async function fetchAis(deps: AisDeps = {}): Promise<AisResult> {
  const apiKey = deps.apiKey ?? process.env.AISSTREAM_API_KEY;
  if (!apiKey) {
    return { attempted: 0, rows: [], dropped: 0, disabled: true };
  }
  const WsCtor =
    deps.WebSocketCtor ??
    (typeof WebSocket !== "undefined" ? WebSocket : undefined);
  if (!WsCtor) {
    throw new Error("ais_marine: WebSocket constructor unavailable");
  }
  const now = deps.now ? deps.now() : new Date();
  const duration = deps.durationMs ?? 10_000;

  const ws = new WsCtor(AIS_WS_URL);
  const seen = new Map<number, PendingVessel>();
  let attempted = 0;
  let dropped = 0;

  await new Promise<void>((resolve, reject) => {
    let closed = false;
    const finish = () => {
      if (closed) return;
      closed = true;
      try {
        ws.close();
      } catch {
        // ignore
      }
      resolve();
    };

    const timeout = setTimeout(finish, duration);

    ws.onopen = () => {
      try {
        ws.send(
          JSON.stringify({
            APIKey: apiKey,
            BoundingBoxes: [SUBSCRIPTION_BBOX],
            FilterMessageTypes: ["PositionReport"],
          }),
        );
      } catch (err) {
        clearTimeout(timeout);
        reject(err instanceof Error ? err : new Error("ais send failed"));
      }
    };

    ws.onmessage = (event: { data: unknown }) => {
      attempted += 1;
      let raw = event.data;
      // Some WS implementations deliver Buffer/Blob/string. Normalize.
      if (raw instanceof ArrayBuffer) raw = Buffer.from(raw).toString("utf8");
      else if (typeof raw !== "string") raw = String(raw);

      let msg: AisMessage;
      try {
        msg = JSON.parse(raw as string) as AisMessage;
      } catch {
        dropped += 1;
        return;
      }
      const meta = msg.MetaData;
      const pr = msg.Message?.PositionReport;
      if (!meta || !pr) {
        dropped += 1;
        return;
      }
      const mmsi = meta.MMSI ?? pr.UserID;
      const lat = pr.Latitude ?? meta.latitude;
      const lng = pr.Longitude ?? meta.longitude;
      if (mmsi == null || lat == null || lng == null) {
        dropped += 1;
        return;
      }
      if (!isInsideSF(lat, lng)) {
        dropped += 1;
        return;
      }

      const occurredAt = meta.time_utc ? new Date(meta.time_utc) : now;
      const name = (meta.ShipName ?? "").trim() || null;

      seen.set(mmsi, {
        mmsi,
        name,
        lat,
        lng,
        sogKn: pr.Sog ?? null,
        cog: pr.Cog ?? null,
        occurredAt: Number.isNaN(occurredAt.getTime()) ? now : occurredAt,
      });
    };

    ws.onerror = (event: Event) => {
      clearTimeout(timeout);
      // ErrorEvent carries `message`, the bare WS Event does not.
      const evt = event as unknown as { message?: unknown };
      const msg = typeof evt.message === "string" ? evt.message : "unknown";
      reject(new Error(`ais_marine ws error: ${msg}`));
    };

    ws.onclose = () => {
      clearTimeout(timeout);
      finish();
    };
  });

  const rows: NewEnvSignal[] = [];
  for (const v of seen.values()) {
    const subtitleParts: string[] = [];
    if (v.sogKn != null) subtitleParts.push(`${v.sogKn.toFixed(1)} kn`);
    if (v.cog != null) subtitleParts.push(`hdg ${Math.round(v.cog)}°`);
    rows.push({
      kind: "vessel",
      source: AIS_MARINE_SOURCE,
      sourceUid: `mmsi-${v.mmsi}`,
      lat: v.lat,
      lng: v.lng,
      severity: vesselSeverity(v.name),
      title: v.name ?? `MMSI ${v.mmsi}`,
      subtitle: subtitleParts.join(" · ") || null,
      occurredAt: v.occurredAt,
      // AIS position fixes are quickly stale; age out after 30 min.
      expiresAt: new Date(v.occurredAt.getTime() + 30 * 60 * 1000),
      raw: v as unknown as Record<string, unknown>,
    });
  }

  return { attempted, rows, dropped };
}
