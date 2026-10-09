import { test } from "node:test";
import assert from "node:assert/strict";
import { cartTotal } from "../../src/cart.js";

test("discount applied once", () => {
  assert.equal(cartTotal([{ priceCents: 500, qty: 2 }], 10), 900);
});
test("rounding on subtotal", () => {
  assert.equal(cartTotal([{ priceCents: 333, qty: 1 }, { priceCents: 333, qty: 1 }], 15), 566);
});
test("no discount", () => {
  assert.equal(cartTotal([{ priceCents: 250, qty: 2 }, { priceCents: 100, qty: 1 }]), 600);
});
