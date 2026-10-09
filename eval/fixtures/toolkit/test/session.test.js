import { test } from "node:test";
import assert from "node:assert/strict";
import { createSession, isSessionValid } from "../src/auth/session.js";

test("new sessions are valid", () => {
  const s = createSession("u1", { now: 1000 });
  assert.equal(isSessionValid(s, 1000), true);
});

test("missing session is invalid", () => {
  assert.equal(isSessionValid(null), false);
});
