import { describe, it, expect } from "vitest";
import { parseArgs } from "./run";
import { WINDOW_HOURS } from "./config";

describe("parseArgs", () => {
  it("defaults to config WINDOW_HOURS", () => {
    expect(parseArgs([])).toEqual({ windowHours: WINDOW_HOURS });
  });
  it("reads --window-hours", () => {
    expect(parseArgs(["--window-hours", "24"])).toEqual({ windowHours: 24 });
  });
  it("rejects a non-positive value", () => {
    expect(() => parseArgs(["--window-hours", "0"])).toThrow(/positive/);
    expect(() => parseArgs(["--window-hours", "nope"])).toThrow(/positive/);
  });
});
