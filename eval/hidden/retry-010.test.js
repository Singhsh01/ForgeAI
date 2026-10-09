import { test, mock } from "node:test";
import assert from "node:assert/strict";
import { retry } from "../../src/retry.js";

test("backoff factor and onRetry", async () => {
  const seen = [];
  const start = Date.now();
  let n = 0;
  const out = await retry(async () => { if (n++ < 2) throw new Error("e" + n); return "ok"; }, {
    attempts: 3, delayMs: 20, factor: 3, onRetry: (err, i) => seen.push([err.message, i]),
  });
  const elapsed = Date.now() - start;
  assert.equal(out, "ok");
  assert.deepEqual(seen, [["e1", 0], ["e2", 1]]);
  assert.ok(elapsed >= 75, `expected >= 80ms of backoff (20 + 60), got ${elapsed}`);
});
test("defaults unchanged", async () => {
  let n = 0;
  await assert.rejects(retry(async () => { n++; throw new Error("x"); }), /x/);
  assert.equal(n, 3);
});
