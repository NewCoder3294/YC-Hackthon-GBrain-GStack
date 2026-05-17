import { randomInt, timingSafeEqual } from "node:crypto";

export function generateVerificationCode(): string {
  return randomInt(0, 1_000_000).toString().padStart(6, "0");
}

export function codeIsValid(
  submitted: string,
  stored: string | null,
  expiresAtIso: string | null | undefined,
): boolean {
  if (!stored || !expiresAtIso) return false;
  if (new Date(expiresAtIso).getTime() < Date.now()) return false;
  if (submitted.length !== stored.length) return false;
  return timingSafeEqual(Buffer.from(submitted), Buffer.from(stored));
}
