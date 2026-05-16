import { describe, it, expect } from "vitest";
import {
  buildSocrataUrl,
  extractLatLng,
  socrataTimestamp,
  utcIsoToLANaive,
  isLAInDST,
} from "./datasf-base";

describe("buildSocrataUrl", () => {
  it("encodes $where, $order, and $limit", () => {
    const url = buildSocrataUrl("gnap-fj3t", {
      where: "received_datetime > '2026-05-16T00:00:00'",
      order: "received_datetime DESC",
      limit: 200,
    });
    expect(url).toContain("https://data.sfgov.org/resource/gnap-fj3t.json?");
    expect(url).toContain("%24where=received_datetime+%3E+%272026-05-16T00%3A00%3A00%27");
    expect(url).toContain("%24order=received_datetime+DESC");
    expect(url).toContain("%24limit=200");
  });

  it("defaults limit to 1000", () => {
    const url = buildSocrataUrl("vw6y-z8j6");
    expect(url).toContain("%24limit=1000");
  });
});

describe("extractLatLng", () => {
  it("prefers Point geometry coordinates", () => {
    expect(
      extractLatLng({ type: "Point", coordinates: [-122.41, 37.78] }, "0", "0"),
    ).toEqual({ lat: 37.78, lng: -122.41 });
  });

  it("falls back to lat/lng strings", () => {
    expect(extractLatLng(undefined, "37.7838", "-122.4144")).toEqual({
      lat: 37.7838,
      lng: -122.4144,
    });
  });

  it("rejects 0,0 coordinates", () => {
    expect(extractLatLng({ type: "Point", coordinates: [0, 0] })).toBeNull();
    expect(extractLatLng(undefined, "0", "0")).toBeNull();
  });

  it("returns null when neither source is valid", () => {
    expect(extractLatLng(undefined, null, null)).toBeNull();
    expect(extractLatLng(undefined, "abc", "def")).toBeNull();
  });
});

describe("socrataTimestamp", () => {
  it("treats naive timestamps as Pacific time (PDT in May)", () => {
    // 14:23 PT during DST = 21:23 UTC (UTC-7).
    const d = socrataTimestamp("2026-05-16T14:23:01.000");
    expect(d?.toISOString()).toBe("2026-05-16T21:23:01.000Z");
  });

  it("treats naive timestamps as Pacific time (PST in January)", () => {
    // 14:23 PT outside DST = 22:23 UTC (UTC-8).
    const d = socrataTimestamp("2026-01-15T14:23:01.000");
    expect(d?.toISOString()).toBe("2026-01-15T22:23:01.000Z");
  });

  it("respects explicit Z suffix", () => {
    const d = socrataTimestamp("2026-05-16T14:23:01.000Z");
    expect(d?.toISOString()).toBe("2026-05-16T14:23:01.000Z");
  });

  it("returns null on invalid", () => {
    expect(socrataTimestamp("not a date")).toBeNull();
    expect(socrataTimestamp(null)).toBeNull();
  });
});

describe("utcIsoToLANaive", () => {
  it("converts UTC ISO to PT-naive during DST", () => {
    // 21:23 UTC in May = 14:23 PT.
    expect(utcIsoToLANaive("2026-05-16T21:23:01.000Z")).toBe(
      "2026-05-16T14:23:01.000",
    );
  });

  it("converts UTC ISO to PT-naive outside DST", () => {
    // 22:23 UTC in January = 14:23 PT.
    expect(utcIsoToLANaive("2026-01-15T22:23:01.000Z")).toBe(
      "2026-01-15T14:23:01.000",
    );
  });
});

describe("isLAInDST", () => {
  it("flags DST inside the US window", () => {
    expect(isLAInDST(2026, 5, 16)).toBe(true);
    expect(isLAInDST(2026, 7, 1)).toBe(true);
  });

  it("flags non-DST outside the US window", () => {
    expect(isLAInDST(2026, 1, 15)).toBe(false);
    expect(isLAInDST(2026, 12, 1)).toBe(false);
  });

  it("handles March 2026 boundary (DST starts Sun Mar 8)", () => {
    expect(isLAInDST(2026, 3, 7)).toBe(false);
    expect(isLAInDST(2026, 3, 8)).toBe(true);
  });

  it("handles November 2026 boundary (DST ends Sun Nov 1)", () => {
    expect(isLAInDST(2026, 10, 31)).toBe(true);
    expect(isLAInDST(2026, 11, 1)).toBe(false);
  });
});
