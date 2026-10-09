import { test } from "node:test";
import assert from "node:assert/strict";
import { readConfig } from "../../src/config.js";

test("coerces", () => {
  assert.deepEqual(readConfig({ PORT: "8080", DEBUG: "YES", NAME: "x" }, { PORT: 3000, DEBUG: false, NAME: "d" }), { PORT: 8080, DEBUG: true, NAME: "x" });
  assert.equal(readConfig({ DEBUG: "0" }, { DEBUG: true }).DEBUG, false);
});
test("defaults", () => {
  assert.deepEqual(readConfig({}, { PORT: 3000 }), { PORT: 3000 });
});
test("invalid throws with key", () => {
  assert.throws(() => readConfig({ PORT: "abc" }, { PORT: 1 }), /PORT/);
  assert.throws(() => readConfig({ DEBUG: "maybe" }, { DEBUG: false }), /DEBUG/);
});
