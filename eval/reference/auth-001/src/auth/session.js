import { randomBytes } from "node:crypto";

const DEFAULT_TTL_MS = 30 * 60 * 1000;

/** Creates a session object that expires after `ttlMs`. */
export function createSession(userId, { ttlMs = DEFAULT_TTL_MS, now = Date.now() } = {}) {
  return {
    userId,
    token: randomBytes(16).toString("hex"),
    createdAt: now,
    expiresAt: now + ttlMs,
  };
}

/** Returns true when the session can be used to authenticate a request. */
export function isSessionValid(session, now = Date.now()) {
  if (!session || !session.token) return false;
  return typeof session.expiresAt === "number" && session.expiresAt > now;
}

/** Extends an active session by `ttlMs` from `now`. */
export function touchSession(session, { ttlMs = DEFAULT_TTL_MS, now = Date.now() } = {}) {
  if (!isSessionValid(session, now)) return null;
  return { ...session, expiresAt: now + ttlMs };
}
