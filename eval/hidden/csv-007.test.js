import { test } from "node:test";
import assert from "node:assert/strict";
import { parseCsvLine } from "../../src/csv.js";

test("quoted commas", () => {
  assert.deepEqual(parseCsvLine('a,"b,c",d'), ["a", "b,c", "d"]);
});
test("escaped quotes", () => {
  assert.deepEqual(parseCsvLine('"say ""hi""",x'), ['say "hi"', "x"]);
});
test("whitespace rules", () => {
  assert.deepEqual(parseCsvLine(' a , "  b  " ,c'), ["a", "  b  ", "c"]);
  assert.deepEqual(parseCsvLine("a,,b"), ["a", "", "b"]);
});
