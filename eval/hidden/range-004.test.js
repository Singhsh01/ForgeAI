import { test } from "node:test";
import assert from "node:assert/strict";
import { daysBetween } from "../../src/dateRange.js";

test("inclusive", () => {
  assert.equal(daysBetween("2024-01-01", "2024-01-01"), 1);
  assert.equal(daysBetween("2024-01-01", "2024-01-31"), 31);
  assert.equal(daysBetween("2024-02-28", "2024-03-01"), 3);
});
test("reversed range", () => {
  assert.equal(daysBetween("2024-01-10", "2024-01-01"), 0);
});
