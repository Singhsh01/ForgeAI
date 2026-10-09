/** Least-recently-used cache with a fixed capacity. */
export class LruCache {
  constructor(capacity = 100) {
    this.capacity = capacity;
    this.map = new Map();
  }
  get(key) {
    if (!this.map.has(key)) return undefined;
    const v = this.map.get(key);
    this.map.delete(key);
    this.map.set(key, v);
    return v;
  }
  set(key, value) {
    if (this.map.has(key)) this.map.delete(key);
    this.map.set(key, value);
    if (this.map.size > this.capacity) this.map.delete(this.map.keys().next().value);
    return this;
  }
  has(key) {
    return this.map.has(key);
  }
  get size() {
    return this.map.size;
  }
}
