import { describe, it, expect, vi } from "vitest";
import { fetchAis } from "./ais-marine";

// Minimal fake WebSocket that lets the caller drive open/message/close.
class FakeWs {
  static lastInstance: FakeWs | null = null;
  url: string;
  onopen: ((ev: unknown) => void) | null = null;
  onmessage: ((ev: { data: unknown }) => void) | null = null;
  onclose: ((ev: unknown) => void) | null = null;
  onerror: ((ev: unknown) => void) | null = null;
  sent: string[] = [];
  closed = false;
  constructor(url: string) {
    this.url = url;
    FakeWs.lastInstance = this;
    // Schedule open in a microtask so subscribers can attach handlers first.
    queueMicrotask(() => this.onopen?.({}));
  }
  send(data: string): void {
    this.sent.push(data);
  }
  close(): void {
    this.closed = true;
    queueMicrotask(() => this.onclose?.({}));
  }
}

function deliver(messages: unknown[]) {
  for (const m of messages) {
    const data = typeof m === "string" ? m : JSON.stringify(m);
    FakeWs.lastInstance!.onmessage?.({ data });
  }
}

describe("fetchAis", () => {
  it("returns disabled when no API key is configured", async () => {
    const orig = process.env.AISSTREAM_API_KEY;
    delete process.env.AISSTREAM_API_KEY;
    try {
      const result = await fetchAis({
        WebSocketCtor: FakeWs as unknown as typeof WebSocket,
        durationMs: 5,
      });
      expect(result.disabled).toBe(true);
      expect(result.attempted).toBe(0);
    } finally {
      if (orig) process.env.AISSTREAM_API_KEY = orig;
    }
  });

  it("sends APIKey + BoundingBoxes on open", async () => {
    const promise = fetchAis({
      apiKey: "k",
      WebSocketCtor: FakeWs as unknown as typeof WebSocket,
      durationMs: 20,
    });
    // Let onopen fire and APIKey subscription be sent.
    await Promise.resolve();
    await Promise.resolve();
    await promise;
    expect(FakeWs.lastInstance!.sent).toHaveLength(1);
    const sub = JSON.parse(FakeWs.lastInstance!.sent[0]!);
    expect(sub.APIKey).toBe("k");
    expect(Array.isArray(sub.BoundingBoxes)).toBe(true);
    expect(sub.FilterMessageTypes).toContain("PositionReport");
  });

  it("captures position reports inside SF and emits vessel env_signals", async () => {
    const promise = fetchAis({
      apiKey: "k",
      WebSocketCtor: FakeWs as unknown as typeof WebSocket,
      durationMs: 20,
      now: () => new Date("2026-05-17T12:00:00Z"),
    });
    // Wait for open.
    await Promise.resolve();
    await Promise.resolve();

    deliver([
      {
        MessageType: "PositionReport",
        MetaData: {
          MMSI: 366000001,
          ShipName: "FERRY ROBERT BRADEN",
          time_utc: "2026-05-17T12:00:00.000 +0000 UTC",
        },
        Message: {
          PositionReport: {
            Latitude: 37.795,
            Longitude: -122.395,
            Sog: 12.5,
            Cog: 87,
          },
        },
      },
      {
        MessageType: "PositionReport",
        MetaData: { MMSI: 366000002, ShipName: "CARGO X" },
        Message: {
          PositionReport: { Latitude: 37.81, Longitude: -122.38, Sog: 6.0 },
        },
      },
    ]);

    const result = await promise;
    expect(result.rows).toHaveLength(2);
    const ferry = result.rows.find((r) => r.sourceUid === "mmsi-366000001");
    expect(ferry).toBeDefined();
    expect(ferry!.kind).toBe("vessel");
    expect(ferry!.severity).toBe("med"); // matches FERRY pattern
    const cargo = result.rows.find((r) => r.sourceUid === "mmsi-366000002");
    expect(cargo!.severity).toBe("med"); // matches CARGO pattern
  });

  it("drops messages outside the SF bbox and malformed payloads", async () => {
    const promise = fetchAis({
      apiKey: "k",
      WebSocketCtor: FakeWs as unknown as typeof WebSocket,
      durationMs: 20,
    });
    await Promise.resolve();
    await Promise.resolve();

    deliver([
      // Outside bbox (Oakland)
      {
        MessageType: "PositionReport",
        MetaData: { MMSI: 1 },
        Message: { PositionReport: { Latitude: 37.81, Longitude: -122.27 } },
      },
      // Malformed JSON
      "not json",
      // Missing MMSI
      {
        MessageType: "PositionReport",
        MetaData: {},
        Message: { PositionReport: { Latitude: 37.78, Longitude: -122.42 } },
      },
    ]);

    const result = await promise;
    expect(result.attempted).toBe(3);
    expect(result.dropped).toBe(3);
    expect(result.rows).toHaveLength(0);
  });

  it("deduplicates by MMSI within a snapshot window", async () => {
    const promise = fetchAis({
      apiKey: "k",
      WebSocketCtor: FakeWs as unknown as typeof WebSocket,
      durationMs: 20,
    });
    await Promise.resolve();
    await Promise.resolve();

    const dupe = {
      MessageType: "PositionReport",
      MetaData: { MMSI: 99 },
      Message: { PositionReport: { Latitude: 37.79, Longitude: -122.4, Sog: 8 } },
    };
    deliver([dupe, dupe, { ...dupe, Message: { PositionReport: { Latitude: 37.795, Longitude: -122.4, Sog: 9 } } }]);

    const result = await promise;
    expect(result.attempted).toBe(3);
    expect(result.rows).toHaveLength(1);
    // last-write-wins: lat/sog should reflect the most recent message.
    expect(result.rows[0]!.lat).toBeCloseTo(37.795, 3);
  });
});
