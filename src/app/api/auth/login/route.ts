import { NextResponse, type NextRequest } from "next/server";
import { timingSafeEqual, createHash } from "node:crypto";
import { z } from "zod";
import { route, parseBody, rateLimit, clientIp, HttpError } from "@/server/http";
import { SESSION_COOKIE, SESSION_TTL_S, signSession } from "@/lib/session";
import { config } from "@/server/config";
import * as store from "@/server/db/store";

const Body = z.object({ email: z.string().email(), password: z.string().min(1).max(500) });
const eq = (a: string, b: string) => timingSafeEqual(createHash("sha256").update(a).digest(), createHash("sha256").update(b).digest());

export const POST = route(async (req: NextRequest) => {
  rateLimit(`login:${clientIp(req)}`, 8, 5 * 60_000);
  const c = config();
  if (!c.adminPassword || !c.sessionSecret || c.sessionSecret.length < 32) {
    throw new HttpError(503, "not_configured", "Set FORGEAI_ADMIN_PASSWORD and a 32+ character FORGEAI_SESSION_SECRET in .env, then restart.");
  }
  const body = await parseBody(req, Body);
  const ok = eq(body.email.toLowerCase(), c.adminEmail.toLowerCase()) && eq(body.password, c.adminPassword);
  if (!ok) {
    await store.audit({ action: "auth.login_failed", ip: clientIp(req), details: { email: body.email } });
    throw new HttpError(401, "invalid_credentials", "Invalid email or password");
  }
  const uid = await store.upsertUser(c.adminEmail.toLowerCase(), c.adminEmail.split("@")[0], "admin");
  const token = await signSession({ uid, email: c.adminEmail, exp: Math.floor(Date.now() / 1000) + SESSION_TTL_S }, c.sessionSecret);
  await store.audit({ userId: uid, action: "auth.login", ip: clientIp(req) });
  const res = NextResponse.json({ ok: true });
  res.cookies.set(SESSION_COOKIE, token, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production" && !process.env.FORGEAI_INSECURE_COOKIES, path: "/", maxAge: SESSION_TTL_S });
  return res;
}, { public: true });
