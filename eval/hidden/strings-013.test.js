import { test } from "node:test";
import assert from "node:assert/strict";
import { wordWrap, truncate, capitalize } from "../../src/strings.js";

test("wraps at spaces", () => {
  assert.equal(wordWrap("the quick brown fox", 10), "the quick\nbrown fox");
});
test("hard splits long words", () => {
  const out = wordWrap("abcdefghij xy", 4);
  for (const l of out.split("\n")) assert.ok(l.length <= 4, l);
  assert.equal(out.replace(/\n/g, "").replace(/ /g, ""), "abcdefghijxy");
});
test("existing exports", () => {
  assert.equal(truncate("hello", 10), "hello");
  assert.equal(capitalize("a"), "A");
});
