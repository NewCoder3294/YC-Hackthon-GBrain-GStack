import { describe, expect, it } from "vitest";
import type { DispatchCall } from "./dispatch";
import {
  buildDispatchEvent,
  buildPredictedEvent,
  callWarrantsEvent,
  pickOfficer,
  runPredictions,
} from "./event-engine";
import { OFFICERS } from "./events";

function call(overrides: Partial<DispatchCall> = {}): DispatchCall {
  return {
    id: `c-${Math.random().toString(36).slice(2, 9)}`,
    audioUrl: "/dispatch-audio/x.m4a",
    callNumber: "200000001",
    receivedAt: new Date().toISOString(),
    recordedAt: null,
    callType: "Suspicious person",
    callTypeCode: "917",
    priority: "C",
    address: "Generic & Test",
    neighborhood: "Tenderloin",
    district: "TENDERLOIN",
    agency: "Police",
    talkgroup: "SFPD Co. D (Tenderloin)",
    talkgroupId: "816",
    lat: 37.7838,
    lng: -122.4144,
    fileName: "x.m4a",
    ...overrides,
  };
}

describe("callWarrantsEvent", () => {
  it("priority A and B always warrant an event", () => {
    expect(callWarrantsEvent(call({ priority: "A" }))).toBe(true);
    expect(callWarrantsEvent(call({ priority: "B" }))).toBe(true);
  });

  it("priority C of routine code does not warrant an event", () => {
    expect(callWarrantsEvent(call({ priority: "C", callTypeCode: "917" }))).toBe(false);
    expect(callWarrantsEvent(call({ priority: "C", callTypeCode: "586" }))).toBe(false);
  });

  it("always-actionable codes warrant an event even at priority C", () => {
    expect(callWarrantsEvent(call({ priority: "C", callTypeCode: "245" }))).toBe(true);
    expect(callWarrantsEvent(call({ priority: "C", callTypeCode: "211" }))).toBe(true);
    expect(callWarrantsEvent(call({ priority: "C", callTypeCode: "SHOTS" }))).toBe(true);
    expect(callWarrantsEvent(call({ priority: "C", callTypeCode: "1015" }))).toBe(true);
  });
});

describe("pickOfficer", () => {
  it("prefers officers with talkgroup affinity", () => {
    const c = call({ talkgroupId: "804" });
    const o = pickOfficer(c, [], () => 0);
    expect(o.talkgroupId).toBe("804");
  });

  it("falls back to full roster when no affinity match", () => {
    const c = call({ talkgroupId: "9999" });
    const o = pickOfficer(c, [], () => 0);
    expect(OFFICERS).toContain(o);
  });

  it("avoids re-assigning officers in the recent window", () => {
    const c = call({ talkgroupId: "812" });
    const affinityIds = OFFICERS.filter((o) => o.talkgroupId === "812").map((o) => o.id);
    const used = affinityIds.slice(0, affinityIds.length - 1);
    const o = pickOfficer(c, used, () => 0);
    expect(used).not.toContain(o.id);
  });
});

describe("runPredictions — escalation", () => {
  it("flags coordinated A+B activity in the same neighborhood", () => {
    const now = Date.now();
    const recentCalls: DispatchCall[] = [
      call({ id: "p-a", priority: "A", neighborhood: "Mission", receivedAt: new Date(now - 30_000).toISOString() }),
      call({ id: "p-b", priority: "B", neighborhood: "Mission", receivedAt: new Date(now - 60_000).toISOString() }),
      call({ id: "p-c", priority: "C", neighborhood: "Mission", receivedAt: new Date(now - 90_000).toISOString() }),
    ];
    const preds = runPredictions({
      recentCalls,
      alreadyPredicted: new Set(),
      now,
    });
    expect(preds.length).toBeGreaterThan(0);
    const escalation = preds.find((p) => p.reason.includes("Coordinated activity"));
    expect(escalation).toBeDefined();
    expect(escalation!.triggerCall.priority).toBe("A");
    expect(escalation!.confidence).toBeGreaterThan(0.5);
  });

  it("does not flag escalation if no A or no B present", () => {
    const now = Date.now();
    const onlyB: DispatchCall[] = [
      call({ priority: "B", neighborhood: "Mission", receivedAt: new Date(now - 30_000).toISOString() }),
      call({ priority: "B", neighborhood: "Mission", receivedAt: new Date(now - 60_000).toISOString() }),
    ];
    const preds = runPredictions({ recentCalls: onlyB, alreadyPredicted: new Set(), now });
    expect(preds.find((p) => p.reason.includes("Coordinated activity"))).toBeUndefined();
  });
});

describe("runPredictions — cluster", () => {
  it("flags 3+ calls in the same neighborhood within 10 minutes", () => {
    const now = Date.now();
    const recentCalls: DispatchCall[] = [
      call({ id: "c1", neighborhood: "Bayview Hunters Point", priority: "C", receivedAt: new Date(now - 60_000).toISOString() }),
      call({ id: "c2", neighborhood: "Bayview Hunters Point", priority: "C", receivedAt: new Date(now - 2 * 60_000).toISOString() }),
      call({ id: "c3", neighborhood: "Bayview Hunters Point", priority: "C", receivedAt: new Date(now - 4 * 60_000).toISOString() }),
    ];
    const preds = runPredictions({ recentCalls, alreadyPredicted: new Set(), now });
    const cluster = preds.find((p) => p.reason.includes("Bayview"));
    expect(cluster).toBeDefined();
    expect(cluster!.signals.length).toBeGreaterThanOrEqual(3);
  });

  it("ignores calls outside the 10-minute window", () => {
    const now = Date.now();
    const recentCalls: DispatchCall[] = [
      call({ neighborhood: "Sunset", receivedAt: new Date(now - 60_000).toISOString() }),
      call({ neighborhood: "Sunset", receivedAt: new Date(now - 12 * 60_000).toISOString() }),
      call({ neighborhood: "Sunset", receivedAt: new Date(now - 20 * 60_000).toISOString() }),
    ];
    const preds = runPredictions({ recentCalls, alreadyPredicted: new Set(), now });
    expect(preds.find((p) => p.reason.includes("Sunset"))).toBeUndefined();
  });
});

describe("runPredictions — hot talkgroup", () => {
  it("flags 4+ calls on the same talkgroup within 8m", () => {
    const now = Date.now();
    const nbList = ["NbA", "NbB", "NbC", "NbD"];
    const recentCalls: DispatchCall[] = Array.from({ length: 4 }, (_, i) =>
      call({
        id: `tg-${i}`,
        talkgroupId: "812",
        talkgroup: "SFPD Co. C (Bayview)",
        // staggered across different neighborhoods so cluster doesn't fire
        neighborhood: nbList[i]!,
        receivedAt: new Date(now - i * 60_000).toISOString(),
      }),
    );
    const preds = runPredictions({ recentCalls, alreadyPredicted: new Set(), now });
    expect(preds.find((p) => p.reason.includes("TG 812"))).toBeDefined();
  });
});

describe("runPredictions — dedupe", () => {
  it("does not re-emit a prediction whose trigger is already in alreadyPredicted", () => {
    const now = Date.now();
    const recentCalls: DispatchCall[] = [
      call({ id: "t1", neighborhood: "Mission", priority: "C", receivedAt: new Date(now - 60_000).toISOString() }),
      call({ id: "t2", neighborhood: "Mission", priority: "C", receivedAt: new Date(now - 2 * 60_000).toISOString() }),
      call({ id: "t3", neighborhood: "Mission", priority: "C", receivedAt: new Date(now - 4 * 60_000).toISOString() }),
    ];
    const first = runPredictions({ recentCalls, alreadyPredicted: new Set(), now });
    expect(first.length).toBeGreaterThan(0);
    const triggerId = first[0]!.triggerCall.id;
    const second = runPredictions({
      recentCalls,
      alreadyPredicted: new Set([triggerId]),
      now,
    });
    expect(second.find((p) => p.triggerCall.id === triggerId)).toBeUndefined();
  });
});

describe("event constructors", () => {
  it("buildDispatchEvent sets assigning status with countdown", () => {
    const c = call({ priority: "A" });
    const o = OFFICERS[0]!;
    const now = Date.now();
    const e = buildDispatchEvent(c, o, now);
    expect(e.kind).toBe("dispatch");
    expect(e.status).toBe("assigning");
    expect(e.assignedOfficer).toBe(o.name);
    expect(new Date(e.autoDispatchAt!).getTime()).toBeGreaterThan(now);
  });

  it("buildPredictedEvent carries reason + confidence + signals", () => {
    const c = call({ priority: "A" });
    const o = OFFICERS[0]!;
    const e = buildPredictedEvent(
      {
        triggerCall: c,
        reason: "Test reason",
        signals: ["s1", "s2"],
        confidence: 0.75,
      },
      o,
    );
    expect(e.kind).toBe("predicted");
    expect(e.reason).toBe("Test reason");
    expect(e.signals).toEqual(["s1", "s2"]);
    expect(e.confidence).toBe(0.75);
  });
});
