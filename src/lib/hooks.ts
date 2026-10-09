"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "./api";
import type { ExecutionEvent } from "./types";

/** Minimal data hook: fetch, refetch, and optional live refresh from the global SSE feed. */
export function useApi<T>(path: string | null, opts: { live?: boolean } = {}) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<Error | null>(null);
  const [loading, setLoading] = useState(Boolean(path));
  const pathRef = useRef(path);
  pathRef.current = path;

  const reload = useCallback(async () => {
    if (!pathRef.current) return;
    try {
      const d = await api<T>(pathRef.current);
      setData(d);
      setError(null);
    } catch (e) {
      setError(e as Error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    setLoading(Boolean(path));
    void reload();
  }, [path, reload]);

  useEffect(() => {
    if (!opts.live || !path) return;
    const es = new EventSource("/api/events");
    let t: ReturnType<typeof setTimeout> | undefined;
    es.addEventListener("change", () => {
      clearTimeout(t);
      t = setTimeout(() => void reload(), 250);
    });
    return () => {
      clearTimeout(t);
      es.close();
    };
  }, [opts.live, path, reload]);

  return { data, error, loading, reload, setData };
}

/** Live execution events for one run over SSE, with automatic resume via Last-Event-ID. */
export function useRunEvents(runId: string, onEvent?: (e: ExecutionEvent) => void) {
  const [events, setEvents] = useState<ExecutionEvent[]>([]);
  const [connected, setConnected] = useState(false);
  const cb = useRef(onEvent);
  cb.current = onEvent;

  useEffect(() => {
    setEvents([]);
    const es = new EventSource(`/api/runs/${runId}/events`);
    es.onopen = () => setConnected(true);
    es.onerror = () => setConnected(false);
    es.addEventListener("execution", (m) => {
      const e = JSON.parse((m as MessageEvent).data) as ExecutionEvent;
      setEvents((prev) => (prev.length && prev[prev.length - 1].seq >= e.seq ? prev : [...prev, e]));
      cb.current?.(e);
    });
    return () => es.close();
  }, [runId]);

  return { events, connected };
}
