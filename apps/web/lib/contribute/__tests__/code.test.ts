import { describe, it, expect } from "vitest";
import { generateVerificationCode, codeIsValid } from "../code";

describe("generateVerificationCode", () => {
  it("returns 6 digits", () => {
    const c = generateVerificationCode();
    expect(c).toMatch(/^\d{6}$/);
  });
});

describe("codeIsValid", () => {
  const inFuture = new Date(Date.now() + 5 * 60_000).toISOString();
  const inPast = new Date(Date.now() - 5 * 60_000).toISOString();

  it("matches when code and expiry are correct", () => {
    expect(codeIsValid("123456", "123456", inFuture)).toBe(true);
  });

  it("rejects mismatched codes", () => {
    expect(codeIsValid("123456", "999999", inFuture)).toBe(false);
  });

  it("rejects expired codes", () => {
    expect(codeIsValid("123456", "123456", inPast)).toBe(false);
  });

  it("rejects when no code stored", () => {
    expect(codeIsValid("123456", null, inFuture)).toBe(false);
  });
});
