import "server-only";
import { Redis } from "@upstash/redis";

// Supports either Vercel-Marketplace Upstash (KV_REST_API_*) or direct Upstash
// (UPSTASH_REDIS_REST_*). Returns null when no creds — callers fall back to L1.
function pickCreds(): { url: string; token: string } | null {
  const url =
    process.env.UPSTASH_REDIS_REST_URL ??
    process.env.KV_REST_API_URL ??
    null;
  const token =
    process.env.UPSTASH_REDIS_REST_TOKEN ??
    process.env.KV_REST_API_TOKEN ??
    null;
  if (!url || !token) return null;
  return { url, token };
}

let cached: Redis | null | undefined;

export function getRedis(): Redis | null {
  if (cached !== undefined) return cached;
  const creds = pickCreds();
  if (!creds) {
    cached = null;
    return null;
  }
  cached = new Redis({ url: creds.url, token: creds.token });
  return cached;
}

export function isRedisEnabled(): boolean {
  return getRedis() !== null;
}
