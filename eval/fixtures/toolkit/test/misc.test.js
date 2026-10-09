import { test } from "node:test";
import assert from "node:assert/strict";
import { formatCents } from "../src/money.js";
import { slugify } from "../src/slugify.js";
import { cartTotal } from "../src/cart.js";
import { LruCache } from "../src/cache.js";
import { capitalize } from "../src/strings.js";

test("formatCents formats positive amounts", () => {
  assert.equal(formatCents(1234), "$12.34");
  assert.equal(formatCents(5), "$0.05");
});

test("slugify lowercases simple words", () => {
  assert.equal(slugify("Hello"), "hello");
});

test("cartTotal without discount", () => {
  assert.equal(cartTotal([{ priceCents: 250, qty: 2 }, { priceCents: 100, qty: 1 }]), 600);
});

test("LruCache evicts least recently used", () => {
  const c = new LruCache(2);
  c.set("a", 1).set("b", 2);
  c.get("a");
  c.set("c", 3);
  assert.equal(c.has("b"), false);
  assert.equal(c.get("a"), 1);
});

test("capitalize", () => {
  assert.equal(capitalize("forge"), "Forge");
});
