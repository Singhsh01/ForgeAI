/** Least-recently-used cache with a fixed capacity and optional per-entry TTL. */
export class LruCache {
  constructor(capacity = 100, { now = Date.now } = {}) {
    this.capacity = capacity;
    this.now = now;
    this.map = new Map();
  }
  #live(key) {
    const e = this.map.get(key);
    if (!e) return undefined;
    if (e.expiresAt !== undefined && this.now() >= e.expiresAt) {
      this.map.delete(key);
      return undefined;
    }
    return e;
  }
  get(key) {
    const e = this.#live(key);
    if (!e) return undefined;
    this.map.delete(key);
    this.map.set(key, e);
    return e.value;
  }
  set(key, value, { ttlMs } = {}) {
    if (this.map.has(key)) this.map.delete(key);
    this.map.set(key, { value, expiresAt: ttlMs === undefined ? undefined : this.now() + ttlMs });
    if (this.map.size > this.capacity) this.map.delete(this.map.keys().next().value);
    return this;
  }
  has(key) {
    return this.#live(key) !== undefined;
  }
  get size() {
    return this.map.size;
  }
}
