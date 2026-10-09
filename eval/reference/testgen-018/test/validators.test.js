import { test } from "node:test";
import assert from "node:assert/strict";
import { isEmail } from "../src/validators.js";

test("valid", () => {
  assert.equal(isEmail("a@b.co"), true);
  assert.equal(isEmail("first.last@sub.example.org"), true);
});
test("invalid", () => {
  for (const v of ["a b@c.de", "a@@b.co", "a@b@c.de", "a@b.co@c.de", "@b.co", "a@", "a@bco", "a@b..co", "a@.co"]) assert.equal(isEmail(v), false, v);
});
test("non-string", () => {
  assert.equal(isEmail(null), false);
  assert.equal(isEmail(42), false);
  assert.equal(isEmail({ toString: () => "a@b.co" }), false);
});
