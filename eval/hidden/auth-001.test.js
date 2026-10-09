import { test } from "node:test";
import assert from "node:assert/strict";
import { createSession, isSessionValid, touchSession } from "../../src/auth/session.js";

test("expired session is invalid", () => {
  const s = createSession("u", { now: 0, ttlMs: 1000 });
  assert.equal(isSessionValid(s, 1000), false);
  assert.equal(isSessionValid(s, 5000), false);
});
test("missing expiresAt is invalid", () => {
  assert.equal(isSessionValid({ token: "t" }, 0), false);
});
test("live session valid; touch refuses expired", () => {
  const s = createSession("u", { now: 0, ttlMs: 1000 });
  assert.equal(isSessionValid(s, 999), true);
  assert.equal(touchSession(s, { now: 2000 }), null);
  assert.equal(touchSession(s, { now: 500, ttlMs: 1000 }).expiresAt, 1500);
});
