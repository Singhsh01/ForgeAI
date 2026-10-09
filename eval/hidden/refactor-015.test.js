import { test } from "node:test";
import assert from "node:assert/strict";
import { paginate } from "../../src/paginate.js";
const items = Array.from({ length: 25 }, (_, i) => i);

test("options form", () => {
  assert.deepEqual(paginate(items, { page: 2, size: 5 }).items, [5, 6, 7, 8, 9]);
  assert.equal(paginate(items, { size: 5 }).page, 1);
});
test("positional form", () => {
  assert.deepEqual(paginate(items, 2, 5).items, [5, 6, 7, 8, 9]);
});
test("defaults", () => {
  assert.deepEqual(paginate(items).items, paginate(items, {}).items);
  assert.equal(paginate(items, {}).items.length, 10);
});
