import { createHash } from "crypto";
import { NextResponse, type NextRequest } from "next/server";
import { getRedis } from "@/lib/cache/redis-client";

type Bucket = { count: number; resetAt: number };

const memoryBuckets = new Map<string, Bucket>();
const MAX_MEMORY_BUCKETS = 10_000;

export interface RateLimitPolicy {
  keyPrefix: string;
  limit: number;
  windowMs: number;
}

export interface RateLimitResult {
  allowed: boolean;
  key: string;
  limit: number;
  remaining: number;
  resetAt: number;
  retryAfter: number;
  store: "redis" | "memory";
}

export const RATE_LIMITS = {
  streamProxy: {
    keyPrefix: "api:hls",
    limit: 1_800,
    windowMs: 60_000,
  },
  imageFrame: {
    keyPrefix: "api:camera-frame",
    limit: 240,
    windowMs: 60_000,
  },
  livePoll: {
    keyPrefix: "api:live-incidents",
    limit: 120,
    windowMs: 60_000,
  },
  mapExport: {
    keyPrefix: "api:map-export",
    limit: 30,
    windowMs: 60_000,
  },
  publicWrite: {
    keyPrefix: "api:public-write",
    limit: 10,
    windowMs: 60_000,
  },
  sensitiveWrite: {
    keyPrefix: "api:sensitive-write",
    limit: 5,
    windowMs: 60_000,
  },
  dispatcherAction: {
    keyPrefix: "api:dispatcher-action",
    limit: 60,
    windowMs: 60_000,
  },
} satisfies Record<string, RateLimitPolicy>;

function firstHeaderValue(value: string | null): string | null {
  return value?.split(",")[0]?.trim() || null;
}

export function clientIp(request: NextRequest): string {
  return (
    firstHeaderValue(request.headers.get("cf-connecting-ip")) ??
    firstHeaderValue(request.headers.get("x-vercel-forwarded-for")) ??
    firstHeaderValue(request.headers.get("x-forwarded-for")) ??
    firstHeaderValue(request.headers.get("x-real-ip")) ??
    "unknown"
  );
}

function hashIdentity(identity: string): string {
  return createHash("sha256").update(identity).digest("hex").slice(0, 32);
}

function rateLimitKey(policy: RateLimitPolicy, identity: string): string {
  return `rl:${policy.keyPrefix}:${hashIdentity(identity)}`;
}

function cleanupMemoryBuckets(now: number) {
  if (memoryBuckets.size <= MAX_MEMORY_BUCKETS) return;
  for (const [key, bucket] of memoryBuckets) {
    if (bucket.resetAt <= now) memoryBuckets.delete(key);
  }
  if (memoryBuckets.size <= MAX_MEMORY_BUCKETS) return;
  for (const key of memoryBuckets.keys()) {
    memoryBuckets.delete(key);
    if (memoryBuckets.size <= MAX_MEMORY_BUCKETS) break;
  }
}

function memoryRateLimit(key: string, policy: RateLimitPolicy): RateLimitResult {
  const now = Date.now();
  cleanupMemoryBuckets(now);
  const bucket = memoryBuckets.get(key);
  if (!bucket || bucket.resetAt <= now) {
    const resetAt = now + policy.windowMs;
    memoryBuckets.set(key, { count: 1, resetAt });
    return {
      allowed: true,
      key,
      limit: policy.limit,
      remaining: Math.max(0, policy.limit - 1),
      resetAt,
      retryAfter: Math.ceil(policy.windowMs / 1000),
      store: "memory",
    };
  }

  const retryAfter = Math.max(1, Math.ceil((bucket.resetAt - now) / 1000));
  if (bucket.count >= policy.limit) {
    return {
      allowed: false,
      key,
      limit: policy.limit,
      remaining: 0,
      resetAt: bucket.resetAt,
      retryAfter,
      store: "memory",
    };
  }

  bucket.count++;
  return {
    allowed: true,
    key,
    limit: policy.limit,
    remaining: Math.max(0, policy.limit - bucket.count),
    resetAt: bucket.resetAt,
    retryAfter,
    store: "memory",
  };
}

export async function checkRateLimit(
  request: NextRequest,
  policy: RateLimitPolicy,
  identity = clientIp(request),
): Promise<RateLimitResult> {
  const key = rateLimitKey(policy, identity);
  const redis = getRedis();
  if (!redis) return memoryRateLimit(key, policy);

  try {
    const count = await redis.incr(key);
    if (count === 1) {
      await redis.pexpire(key, policy.windowMs);
    }
    let ttl = await redis.pttl(key);
    if (ttl < 0) {
      await redis.pexpire(key, policy.windowMs);
      ttl = policy.windowMs;
    }
    const resetAt = Date.now() + ttl;
    return {
      allowed: count <= policy.limit,
      key,
      limit: policy.limit,
      remaining: Math.max(0, policy.limit - count),
      resetAt,
      retryAfter: Math.max(1, Math.ceil(ttl / 1000)),
      store: "redis",
    };
  } catch (err) {
    console.warn(
      "[rate-limit] redis unavailable; falling back to in-memory limiter",
      err,
    );
    return memoryRateLimit(key, policy);
  }
}

export function rateLimitHeaders(result: RateLimitResult): Headers {
  const headers = new Headers();
  headers.set("RateLimit-Limit", String(result.limit));
  headers.set("RateLimit-Remaining", String(result.remaining));
  headers.set("RateLimit-Reset", String(result.retryAfter));
  headers.set("X-RateLimit-Limit", String(result.limit));
  headers.set("X-RateLimit-Remaining", String(result.remaining));
  headers.set("X-RateLimit-Reset", String(Math.ceil(result.resetAt / 1000)));
  return headers;
}

export function withRateLimitHeaders<T extends Response>(
  response: T,
  result: RateLimitResult,
): T {
  for (const [key, value] of rateLimitHeaders(result)) {
    response.headers.set(key, value);
  }
  return response;
}

export function rateLimitResponse(result: RateLimitResult): NextResponse {
  const headers = rateLimitHeaders(result);
  headers.set("Retry-After", String(result.retryAfter));
  return NextResponse.json(
    { error: "rate_limited", retryAfter: result.retryAfter },
    { status: 429, headers },
  );
}

export function _resetRateLimitForTests() {
  memoryBuckets.clear();
}
