import { test } from "node:test";
import assert from "node:assert/strict";
import { formatCents } from "../../src/money.js";

test("negative amounts", () => {
  assert.equal(formatCents(-1234), "-$12.34");
  assert.equal(formatCents(-5), "-$0.05");
  assert.equal(formatCents(-100, "€"), "-€1.00");
});
test("positive unchanged", () => {
  assert.equal(formatCents(1234), "$12.34");
  assert.equal(formatCents(0), "$0.00");
});
