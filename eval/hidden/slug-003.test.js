import { test } from "node:test";
import assert from "node:assert/strict";
import { slugify } from "../../src/slugify.js";

test("collapses and trims separators", () => {
  assert.equal(slugify("  Hello,   World!  "), "hello-world");
  assert.equal(slugify("--a--b--"), "a-b");
});
test("transliterates accents", () => {
  assert.equal(slugify("Crème brûlée"), "creme-brulee");
});
test("simple words unchanged", () => {
  assert.equal(slugify("Hello"), "hello");
});
