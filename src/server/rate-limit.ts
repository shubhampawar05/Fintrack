import "server-only";

/** Simple in-memory sliding-window limiter (single-instance personal app). */
const hits = new Map<string, number[]>();

export function rateLimit(key: string, limit: number, windowMs: number): { ok: boolean; retryAfterMs: number } {
  const now = Date.now();
  const recent = (hits.get(key) ?? []).filter((t) => now - t < windowMs);
  if (recent.length >= limit) {
    hits.set(key, recent);
    return { ok: false, retryAfterMs: windowMs - (now - recent[0]) };
  }
  recent.push(now);
  hits.set(key, recent);
  return { ok: true, retryAfterMs: 0 };
}

export function resetRateLimits() {
  hits.clear();
}
