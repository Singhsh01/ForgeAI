import type { NextRequest } from "next/server";
import { subscribeGlobal } from "@/server/events";
import { requireSession } from "@/server/http";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** Global change feed used by list views (workspace, observability) to refresh live. */
export async function GET(req: NextRequest) {
  try {
    await requireSession();
  } catch {
    return Response.json({ error: { code: "unauthorized", message: "Sign in required" } }, { status: 401 });
  }
  const enc = new TextEncoder();
  let off = () => {};
  let hb: ReturnType<typeof setInterval> | undefined;
  const stream = new ReadableStream({
    start(c) {
      off = subscribeGlobal((e) => c.enqueue(enc.encode(`event: change\ndata: ${JSON.stringify(e)}\n\n`)));
      hb = setInterval(() => c.enqueue(enc.encode(`: ping\n\n`)), 15_000);
    },
    cancel() {
      off();
      if (hb) clearInterval(hb);
    },
  });
  req.signal.addEventListener("abort", () => {
    off();
    if (hb) clearInterval(hb);
  });
  return new Response(stream, { headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache, no-transform", Connection: "keep-alive" } });
}
