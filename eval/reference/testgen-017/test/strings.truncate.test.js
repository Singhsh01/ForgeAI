import { test } from "node:test";
import assert from "node:assert/strict";
import { truncate } from "../src/strings.js";

test("short strings unchanged", () => {
  assert.equal(truncate("abc", 5), "abc");
  assert.equal(truncate("abcde", 5), "abcde");
});
test("long strings end with an ellipsis and respect max", () => {
  assert.equal(truncate("abcdef", 5), "abcd…");
  assert.equal(truncate("abcdef", 5).length, 5);
});
test("tiny max", () => {
  assert.equal(truncate("abc", 1), "…");
  assert.equal(truncate("abc", 0), "");
});
