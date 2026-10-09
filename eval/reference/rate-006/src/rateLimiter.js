function clamp(n, min, max) {
  return Math.min(max, Math.max(min, n));
}

/**
 * Fixed-window rate limiter. `take(key, now)` returns true if the request is allowed.
 * Each key may make `limit` requests per `windowMs`.
 */
export function createRateLimiter({ limit, windowMs }) {
  const windows = new Map();
  const current = (key, now) => {
    let w = windows.get(key);
    if (!w || now - w.start >= windowMs) {
      w = { start: now, count: 0 };
      windows.set(key, w);
    }
    return w;
  };
  return {
    take(key, now = Date.now()) {
      const w = current(key, now);
      if (w.count >= limit) return false;
      w.count++;
      return true;
    },
    remaining(key, now = Date.now()) {
      const w = windows.get(key);
      if (!w || now - w.start >= windowMs) return limit;
      return clamp(limit - w.count, 0, limit);
    },
  };
}
