import { describe, it, expect, vi, beforeEach } from "vitest";
import { rateLimit, _resetRateLimit } from "../ratelimit";

describe("rateLimit", () => {
  beforeEach(() => {
    _resetRateLimit();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-16T12:00:00Z"));
  });

  it("allows up to the limit then blocks", () => {
    const ip = "1.1.1.1";
    for (let i = 0; i < 10; i++) {
      expect(rateLimit(ip, { limit: 10, windowMs: 60_000 })).toBe(true);
    }
    expect(rateLimit(ip, { limit: 10, windowMs: 60_000 })).toBe(false);
  });

  it("isolates by ip", () => {
    expect(rateLimit("1.1.1.1", { limit: 1, windowMs: 60_000 })).toBe(true);
    expect(rateLimit("2.2.2.2", { limit: 1, windowMs: 60_000 })).toBe(true);
  });

  it("resets after the window", () => {
    rateLimit("1.1.1.1", { limit: 1, windowMs: 60_000 });
    expect(rateLimit("1.1.1.1", { limit: 1, windowMs: 60_000 })).toBe(false);
    vi.advanceTimersByTime(60_001);
    expect(rateLimit("1.1.1.1", { limit: 1, windowMs: 60_000 })).toBe(true);
  });
});
