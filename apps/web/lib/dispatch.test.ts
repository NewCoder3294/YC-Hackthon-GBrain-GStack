import { describe, expect, it } from "vitest";
import { isHighPriority, priorityLabel } from "./dispatch";
import {
  createSimulatorState,
  jitterInterval,
  mulberry32,
  nextDispatchCall,
  shuffleInPlace,
} from "./dispatch-simulator";
import { mergeFilenameMeta, parseOpenMhzFilename } from "./dispatch-filename";
import type { AudioFile } from "./dispatch";

const SAMPLE_FILES: AudioFile[] = Array.from({ length: 8 }, (_, i) => ({
  file: `call-${String(i).padStart(3, "0")}.m4a`,
  audioUrl: `/dispatch-audio/call-${String(i).padStart(3, "0")}.m4a`,
  meta: null,
}));

describe("priorityLabel", () => {
  it("labels known priorities", () => {
    expect(priorityLabel("A")).toMatch(/emergency/i);
    expect(priorityLabel("B")).toMatch(/urgent/i);
    expect(priorityLabel("C")).toMatch(/routine/i);
  });
  it("falls back for unknown / empty", () => {
    expect(priorityLabel("X")).toBe("Priority X");
    expect(priorityLabel("")).toBe("Unknown priority");
  });
});

describe("isHighPriority", () => {
  it("A and B are high", () => {
    expect(isHighPriority("A")).toBe(true);
    expect(isHighPriority("B")).toBe(true);
    expect(isHighPriority("b")).toBe(true);
  });
  it("C and E and empty are not", () => {
    expect(isHighPriority("C")).toBe(false);
    expect(isHighPriority("E")).toBe(false);
    expect(isHighPriority("")).toBe(false);
  });
});

describe("mulberry32", () => {
  it("is deterministic for a given seed", () => {
    const a = mulberry32(42);
    const b = mulberry32(42);
    const seqA = Array.from({ length: 5 }, () => a());
    const seqB = Array.from({ length: 5 }, () => b());
    expect(seqA).toEqual(seqB);
  });
  it("returns values in [0,1)", () => {
    const r = mulberry32(1);
    for (let i = 0; i < 50; i++) {
      const v = r();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });
});

describe("shuffleInPlace", () => {
  it("preserves the set of elements", () => {
    const xs = [1, 2, 3, 4, 5];
    const rnd = mulberry32(7);
    const out = shuffleInPlace([...xs], rnd);
    expect([...out].sort()).toEqual(xs);
  });
});

describe("jitterInterval", () => {
  it("stays within bounds", () => {
    const rnd = mulberry32(99);
    for (let i = 0; i < 100; i++) {
      const v = jitterInterval(15_000, rnd, 4_000, 45_000);
      expect(v).toBeGreaterThanOrEqual(4_000);
      expect(v).toBeLessThanOrEqual(45_000);
    }
  });
});

describe("nextDispatchCall", () => {
  it("does not repeat the same audio file twice in a row across a deck of >1", () => {
    const state = createSimulatorState(SAMPLE_FILES, { seed: 123 });
    let prev: string | null = null;
    for (let i = 0; i < 100; i++) {
      const call = nextDispatchCall(state);
      expect(call.fileName).not.toBe(prev);
      prev = call.fileName;
    }
  });

  it("avoids the same neighborhood twice in a row when possible", () => {
    const state = createSimulatorState(SAMPLE_FILES, { seed: 456 });
    let prev: string | null = null;
    let repeats = 0;
    for (let i = 0; i < 200; i++) {
      const call = nextDispatchCall(state);
      if (call.neighborhood === prev) repeats++;
      prev = call.neighborhood;
    }
    // With 20 weighted hotspots and the avoid-last rule, we should
    // never get a back-to-back repeat in this run.
    expect(repeats).toBe(0);
  });

  it("places every pin within an SF-ish bounding box", () => {
    const state = createSimulatorState(SAMPLE_FILES, { seed: 789 });
    for (let i = 0; i < 200; i++) {
      const call = nextDispatchCall(state);
      expect(call.lat).toBeGreaterThan(37.7);
      expect(call.lat).toBeLessThan(37.82);
      expect(call.lng).toBeGreaterThan(-122.52);
      expect(call.lng).toBeLessThan(-122.38);
    }
  });

  it("uses manifest fields when present and generates the rest", () => {
    const files: AudioFile[] = [
      {
        file: "real.m4a",
        audioUrl: "/dispatch-audio/real.m4a",
        meta: {
          file: "real.m4a",
          callType: "Manifest Type",
          callTypeCode: "999",
          priority: "A",
        },
      },
    ];
    const state = createSimulatorState(files, { seed: 1 });
    const call = nextDispatchCall(state);
    expect(call.callType).toBe("Manifest Type");
    expect(call.callTypeCode).toBe("999");
    expect(call.priority).toBe("A");
    // Address comes from neighborhood fallback (no meta address provided).
    expect(call.address.length).toBeGreaterThan(0);
    expect(call.generated).toBe(false);
  });

  it("throws on empty deck", () => {
    const state = createSimulatorState([], { seed: 1 });
    expect(() => nextDispatchCall(state)).toThrow(/empty deck/);
  });

  it("uses filename-derived talkgroup + recordedAt for OpenMHz-named files", () => {
    const files: AudioFile[] = [
      {
        file: "sfp25-812-1778753073.m4a",
        audioUrl: "/dispatch-audio/sfp25-812-1778753073.m4a",
        meta: {
          file: "sfp25-812-1778753073.m4a",
          talkgroup: "SFPD Co. C (Bayview)",
          talkgroupId: "812",
          recordedAt: "2026-05-14T13:24:33.000Z",
        },
      },
    ];
    const state = createSimulatorState(files, { seed: 1 });
    const call = nextDispatchCall(state);
    expect(call.talkgroupId).toBe("812");
    expect(call.talkgroup).toMatch(/SFPD Co\. C/);
    expect(call.recordedAt).toBe("2026-05-14T13:24:33.000Z");
  });
});

describe("parseOpenMhzFilename", () => {
  it("extracts talkgroup and timestamp from OpenMHz captured names", () => {
    const r = parseOpenMhzFilename("sfp25-812-1778753073.m4a");
    expect(r).not.toBeNull();
    expect(r!.talkgroupId).toBe("812");
    expect(r!.talkgroupName).toMatch(/Bayview/);
    expect(new Date(r!.recordedAt).getTime()).toBe(1778753073 * 1000);
  });

  it("supports mp3 / wav / ogg / aac", () => {
    expect(parseOpenMhzFilename("sfp25-804-1778752999.mp3")?.talkgroupId).toBe("804");
    expect(parseOpenMhzFilename("sfp25-804-1778752999.wav")?.talkgroupId).toBe("804");
    expect(parseOpenMhzFilename("sfp25-804-1778752999.ogg")?.talkgroupId).toBe("804");
    expect(parseOpenMhzFilename("sfp25-804-1778752999.aac")?.talkgroupId).toBe("804");
  });

  it("returns null for non-OpenMHz names", () => {
    expect(parseOpenMhzFilename("random.m4a")).toBeNull();
    expect(parseOpenMhzFilename("hello.txt")).toBeNull();
    expect(parseOpenMhzFilename("sfp25-only.m4a")).toBeNull();
  });

  it("falls back to generic 'Talkgroup N' for unknown talkgroup ids", () => {
    const r = parseOpenMhzFilename("sfp25-9999-1778753073.m4a");
    expect(r?.talkgroupName).toBe("Talkgroup 9999");
  });
});

describe("mergeFilenameMeta", () => {
  it("manifest entry wins over filename when both present", () => {
    const merged = mergeFilenameMeta(
      { file: "sfp25-812-1778753073.m4a", talkgroup: "Custom name" },
      "sfp25-812-1778753073.m4a",
    );
    expect(merged?.talkgroup).toBe("Custom name");
    // Filename still fills the gaps (talkgroupId, recordedAt).
    expect(merged?.talkgroupId).toBe("812");
    expect(merged?.recordedAt).toBeDefined();
  });

  it("filename creates entry when no manifest", () => {
    const merged = mergeFilenameMeta(null, "sfp25-812-1778753073.m4a");
    expect(merged).not.toBeNull();
    expect(merged?.talkgroupId).toBe("812");
  });

  it("returns null for unrecognized name with no manifest", () => {
    expect(mergeFilenameMeta(null, "random.m4a")).toBeNull();
  });
});
