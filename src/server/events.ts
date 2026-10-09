import { EventEmitter } from "node:events";
import * as store from "./db/store";
import type { ExecutionEvent, AgentName } from "@/lib/types";

/**
 * Event bus: every execution event is persisted first (source of truth, replayable),
 * then fanned out in-process to live SSE subscribers. Writes are serialised per run so
 * sequence numbers stay gap-free and ordered.
 */
const g = globalThis as unknown as { __forgeaiBus?: EventEmitter; __forgeaiChains?: Map<string, Promise<unknown>> };
const bus = (g.__forgeaiBus ??= new EventEmitter().setMaxListeners(500));
const chains = (g.__forgeaiChains ??= new Map());

export type EmitInput = { type: ExecutionEvent["type"]; agent?: AgentName | null; level?: ExecutionEvent["level"]; message: string; data?: Record<string, unknown> | null };

export function emit(runId: string, e: EmitInput): Promise<ExecutionEvent> {
  const prev = chains.get(runId) ?? Promise.resolve();
  const next = prev.catch(() => undefined).then(async () => {
    const ev = await store.appendEvent({ runId, ...e });
    bus.emit(`run:${runId}`, ev);
    return ev;
  });
  chains.set(runId, next);
  next.finally(() => {
    if (chains.get(runId) === next) chains.delete(runId);
  }).catch(() => undefined);
  return next;
}

export function subscribe(runId: string, fn: (e: ExecutionEvent) => void) {
  bus.on(`run:${runId}`, fn);
  return () => bus.off(`run:${runId}`, fn);
}

/** Notifies UI lists (workspace, observability) that something changed. */
export function notifyGlobal(kind: string, payload: Record<string, unknown>) {
  bus.emit("global", { kind, ...payload, at: new Date().toISOString() });
}
export function subscribeGlobal(fn: (e: Record<string, unknown>) => void) {
  bus.on("global", fn);
  return () => bus.off("global", fn);
}
