import { test } from "node:test";
import assert from "node:assert/strict";
import { Emitter } from "../../src/events.js";

test("once fires once", () => {
  const e = new Emitter(); const calls = [];
  e.once("x", (v) => calls.push(v));
  e.emit("x", 1); e.emit("x", 2);
  assert.deepEqual(calls, [1]);
});
test("once unsubscribe", () => {
  const e = new Emitter(); let n = 0;
  const off = e.once("x", () => n++); off(); e.emit("x");
  assert.equal(n, 0);
});
test("on unaffected", () => {
  const e = new Emitter(); let n = 0;
  e.on("x", () => n++); e.once("x", () => {}); e.emit("x"); e.emit("x");
  assert.equal(n, 2);
});
