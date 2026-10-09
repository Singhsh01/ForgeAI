function clamp(n, min, max) {
  return Math.min(max, Math.max(min, n));
}

/**
 * Fixed-window rate limiter. `take(key, now)` returns true if the request is allowed.
 * Each key may make `limit` requests per `windowMs`.
 */
export function createRateLimiter({ limit, windowMs }) {
  const windows = new Map();
  return {
    take(key, now = Date.now()) {
      let w = windows.get(key);
      if (!w) {
        w = { start: now, count: 0 };
        windows.set(key, w);
      }
      if (w.count >= limit) return false;
      w.count++;
      return true;
    },
    remaining(key) {
      const w = windows.get(key);
      return clamp(limit - (w ? w.count : 0), 0, limit);
    },
  };
}
