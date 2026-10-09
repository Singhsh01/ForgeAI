import { NextResponse, type NextRequest } from "next/server";
import { cookies } from "next/headers";
import { z } from "zod";
import { SESSION_COOKIE, verifySession, type Session } from "@/lib/session";
import { logger } from "./logger";
import { redact } from "./redact";
import { recoverOnce } from "./workflow/runner";

export class HttpError extends Error {
  constructor(readonly status: number, readonly code: string, message: string, readonly details?: unknown) {
    super(message);
  }
}

export async function currentSession(): Promise<Session | null> {
  const jar = await cookies();
  return verifySession(jar.get(SESSION_COOKIE)?.value, process.env.FORGEAI_SESSION_SECRET);
}

export async function requireSession(): Promise<Session> {
  const s = await currentSession();
  if (!s) throw new HttpError(401, "unauthorized", "Sign in required");
  return s;
}

export async function parseBody<T>(req: NextRequest, schema: z.ZodType<T>): Promise<T> {
  let json: unknown;
  try {
    json = await req.json();
  } catch {
    throw new HttpError(400, "invalid_json", "Request body must be JSON");
  }
  const r = schema.safeParse(json);
  if (!r.success) throw new HttpError(422, "validation_failed", "Request validation failed", z.flattenError(r.error));
  return r.data;
}

// Simple fixed-window rate limiter (per key). Adequate for a single-node deployment.
const buckets = new Map<string, { n: number; reset: number }>();
export function rateLimit(key: string, limit: number, windowMs: number) {
  const now = Date.now();
  const b = buckets.get(key);
  if (!b || b.reset < now) {
    buckets.set(key, { n: 1, reset: now + windowMs });
    return;
  }
  if (++b.n > limit) throw new HttpError(429, "rate_limited", `Too many requests; retry in ${Math.ceil((b.reset - now) / 1000)}s`);
}

export function clientIp(req: NextRequest) {
  return req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local";
}

type Handler<C> = (req: NextRequest, ctx: C & { session: Session }) => Promise<Response | unknown>;

/** Wraps a route handler with auth, recovery-on-boot, and structured error responses. */
export function route<C = { params: Promise<Record<string, string>> }>(handler: Handler<C>, opts: { public?: boolean } = {}) {
  return async (req: NextRequest, ctx: C) => {
    try {
      await recoverOnce();
      const session = opts.public ? ({ uid: "", email: "", exp: 0 } as Session) : await requireSession();
      if (!opts.public && req.method !== "GET") rateLimit(`w:${session.uid}`, 120, 60_000);
      const out = await handler(req, { ...ctx, session });
      if (out instanceof Response) return out;
      return NextResponse.json(out ?? { ok: true });
    } catch (e) {
      if (e instanceof HttpError) return NextResponse.json({ error: { code: e.code, message: e.message, details: e.details } }, { status: e.status });
      const msg = redact((e as Error).message ?? "Internal error");
      logger.error({ err: msg, path: req.nextUrl.pathname }, "request failed");
      const known = /not configured|not found|Only interrupted|already decided|Invalid repository|not allowed|outside/i.test(msg);
      return NextResponse.json({ error: { code: known ? "bad_request" : "internal_error", message: msg } }, { status: known ? 400 : 500 });
    }
  };
}
