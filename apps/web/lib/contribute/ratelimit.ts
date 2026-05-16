type Bucket = { count: number; resetAt: number };
const buckets = new Map<string, Bucket>();

interface Opts {
  limit: number;
  windowMs: number;
}

export function rateLimit(key: string, { limit, windowMs }: Opts): boolean {
  const now = Date.now();
  const b = buckets.get(key);
  if (!b || b.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }
  if (b.count >= limit) return false;
  b.count++;
  return true;
}

export function _resetRateLimit() {
  buckets.clear();
}
