import { timingSafeEqual } from "crypto";
import { env } from "./env";

/**
 * Constant-time bearer-token check for cron handlers.
 * Returns true only if `Authorization: Bearer <CRON_SECRET>` matches exactly.
 * Buffers are length-checked before `timingSafeEqual` (which requires equal length)
 * and the secret-missing branch returns false early without a comparison so the
 * timing signal doesn't leak config state.
 */
export function isAuthorizedCron(authHeader: string | null): boolean {
  if (!env.CRON_SECRET) return false;
  if (!authHeader) return false;
  const expected = `Bearer ${env.CRON_SECRET}`;
  const a = Buffer.from(authHeader);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}
