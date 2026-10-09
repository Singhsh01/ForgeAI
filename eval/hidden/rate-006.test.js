import { test } from "node:test";
import assert from "node:assert/strict";
import { createRateLimiter } from "../../src/rateLimiter.js";

test("window resets", () => {
  const rl = createRateLimiter({ limit: 2, windowMs: 1000 });
  assert.equal(rl.take("a", 0), true);
  assert.equal(rl.take("a", 10), true);
  assert.equal(rl.take("a", 20), false);
  assert.equal(rl.take("a", 1000), true);
});
test("per key", () => {
  const rl = createRateLimiter({ limit: 1, windowMs: 1000 });
  assert.equal(rl.take("a", 0), true);
  assert.equal(rl.take("b", 0), true);
  assert.equal(rl.take("a", 1), false);
});
test("remaining resets", () => {
  const rl = createRateLimiter({ limit: 3, windowMs: 100 });
  rl.take("k", 0); rl.take("k", 1);
  assert.equal(rl.remaining("k", 50), 1);
  assert.equal(rl.remaining("k", 150), 3);
});
