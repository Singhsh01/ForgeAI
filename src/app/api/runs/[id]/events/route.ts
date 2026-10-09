import type { NextRequest } from "next/server";
import * as store from "@/server/db/store";
import { subscribe } from "@/server/events";
import { requireSession, HttpError } from "@/server/http";
import type { ExecutionEvent } from "@/lib/types";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** Server-sent events: replays persisted events after `Last-Event-ID`/`after`, then streams live ones. */
export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireSession();
    const { id } = await ctx.params;
    if ((await store.runOwner(id)) !== session.uid) throw new HttpError(404, "not_found", "Run not found");
    const after = Number(req.headers.get("last-event-id") ?? req.nextUrl.searchParams.get("after") ?? 0) || 0;
    const encoder = new TextEncoder();
    let unsubscribe = () => {};
    let heartbeat: ReturnType<typeof setInterval> | undefined;
    const stream = new ReadableStream({
      async start(controller) {
        let lastSeq = after;
        const send = (e: ExecutionEvent) => {
          if (e.seq <= lastSeq) return;
          lastSeq = e.seq;
          controller.enqueue(encoder.encode(`id: ${e.seq}\nevent: execution\ndata: ${JSON.stringify(e)}\n\n`));
        };
        const pending: ExecutionEvent[] = [];
        let replaying = true;
        unsubscribe = subscribe(id, (e) => (replaying ? pending.push(e) : send(e)));
        for (const e of await store.listEvents(id, after)) send(e);
        replaying = false;
        pending.sort((a, b) => a.seq - b.seq).forEach(send);
        heartbeat = setInterval(() => controller.enqueue(encoder.encode(`: ping\n\n`)), 15_000);
      },
      cancel() {
        unsubscribe();
        if (heartbeat) clearInterval(heartbeat);
      },
    });
    req.signal.addEventListener("abort", () => {
      unsubscribe();
      if (heartbeat) clearInterval(heartbeat);
    });
    return new Response(stream, { headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache, no-transform", Connection: "keep-alive", "X-Accel-Buffering": "no" } });
  } catch (e) {
    const status = e instanceof HttpError ? e.status : 500;
    return Response.json({ error: { code: "error", message: (e as Error).message } }, { status });
  }
}
