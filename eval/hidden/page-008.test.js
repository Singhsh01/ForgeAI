import { test } from "node:test";
import assert from "node:assert/strict";
import { paginate } from "../../src/paginate.js";
const items = Array.from({ length: 25 }, (_, i) => i);

test("page 1 starts at 0", () => {
  assert.deepEqual(paginate(items, 1, 10).items, [0,1,2,3,4,5,6,7,8,9]);
});
test("last page remainder", () => {
  const p = paginate(items, 3, 10);
  assert.deepEqual(p.items, [20,21,22,23,24]);
  assert.equal(p.pages, 3);
});
test("clamped", () => {
  assert.equal(paginate(items, 99, 10).page, 3);
  assert.deepEqual(paginate(items, 0, 10).items[0], 0);
});
