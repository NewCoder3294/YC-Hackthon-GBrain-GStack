import { describe, it, expect } from "vitest";
import { generateContributorToken } from "../token";

describe("generateContributorToken", () => {
  it("returns a 43-character base64url string", () => {
    const t = generateContributorToken();
    expect(t).toMatch(/^[A-Za-z0-9_-]{43}$/);
  });

  it("returns a different value every call", () => {
    const a = generateContributorToken();
    const b = generateContributorToken();
    expect(a).not.toBe(b);
  });
});
