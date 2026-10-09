import { test } from "node:test";
import assert from "node:assert/strict";
import { LruCache } from "../../src/cache.js";

test("ttl expiry with injected clock", () => {
  let t = 0;
  const c = new LruCache(10, { now: () => t });
  c.set("a", 1, { ttlMs: 100 });
  c.set("b", 2);
  t = 99;
  assert.equal(c.get("a"), 1);
  t = 100;
  assert.equal(c.get("a"), undefined);
  assert.equal(c.has("a"), false);
  t = 1e9;
  assert.equal(c.get("b"), 2);
});
test("lru still works", () => {
  const c = new LruCache(2);
  c.set("a", 1).set("b", 2);
  c.get("a");
  c.set("c", 3);
  assert.equal(c.has("b"), false);
});
