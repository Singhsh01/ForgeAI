import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { clamp } from "../../src/math.js";
import { paginate } from "../../src/paginate.js";
import { createRateLimiter } from "../../src/rateLimiter.js";

const read = (p) => fs.readFileSync(new URL(`../../src/${p}`, import.meta.url), "utf8");

test("clamp exported", () => {
  assert.equal(clamp(5, 0, 3), 3);
  assert.equal(clamp(-1, 0, 3), 0);
  assert.equal(clamp(2, 0, 3), 2);
});
test("no local copies", () => {
  for (const f of ["paginate.js", "rateLimiter.js"]) {
    const s = read(f);
    assert.doesNotMatch(s, /function\s+clamp\s*\(/, `${f} still defines clamp`);
    assert.match(s, /from\s*["']\.\/math\.js["']/, `${f} does not import ./math.js`);
  }
});
test("behaviour unchanged", () => {
  const items = Array.from({ length: 25 }, (_, i) => i);
  assert.equal(paginate(items, 99, 10).page, 3);
  assert.equal(paginate(items, -4, 10).page, 1);
  const rl = createRateLimiter({ limit: 2, windowMs: 1000 });
  rl.take("a", 0);
  assert.equal(rl.remaining("a"), 1);
});
