import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, verifySession } from "@/lib/session";

const PUBLIC_API = ["/api/auth/login", "/api/auth/logout", "/api/health"];

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const isApi = pathname.startsWith("/api/");
  if (isApi && PUBLIC_API.includes(pathname)) return NextResponse.next();

  const session = await verifySession(req.cookies.get(SESSION_COOKIE)?.value, process.env.FORGEAI_SESSION_SECRET);
  if (session) return NextResponse.next();

  if (isApi) return NextResponse.json({ error: { code: "unauthorized", message: "Sign in required" } }, { status: 401 });
  const url = req.nextUrl.clone();
  url.pathname = "/login";
  url.searchParams.set("next", pathname);
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ["/app/:path*", "/api/:path*"],
};
