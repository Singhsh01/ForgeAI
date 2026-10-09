import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { roundCents } from "../../src/money.js";
import { cartTotal } from "../../src/cart.js";

test("roundCents half away from zero", () => {
  assert.equal(roundCents(2.5), 3);
  assert.equal(roundCents(-2.5), -3);
  assert.equal(roundCents(2.4), 2);
});
test("cart uses roundCents", () => {
  const src = fs.readFileSync(new URL("../../src/cart.js", import.meta.url), "utf8");
  assert.match(src, /import\s*\{[^}]*roundCents[^}]*\}\s*from\s*["']\.\/money\.js["']/);
});
test("cartTotal results identical (including existing behaviour)", () => {
  assert.equal(cartTotal([{ priceCents: 500, qty: 2 }], 10), 810);
  assert.equal(cartTotal([{ priceCents: 333, qty: 1 }, { priceCents: 333, qty: 1 }], 15), 481);
  assert.equal(cartTotal([{ priceCents: 250, qty: 2 }, { priceCents: 100, qty: 1 }]), 600);
});
