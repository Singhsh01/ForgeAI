"use client";

import Link from "next/link";
import { useState } from "react";
import { motion } from "motion/react";
import { Panel, SectionTitle } from "@/components/ui/panel";
import { StatusPill } from "@/components/ui/status";
import { useApi } from "@/lib/hooks";
import type { RunStatus } from "@/lib/types";
import { cn, fmtDuration, fmtTokens, fmtUsd, timeAgo } from "@/lib/utils";

type RunRow = {
  id: string; task_title: string; repo_name: string; status: RunStatus; phase: string; trace_id: string; model: string;
  input_tokens: number; output_tokens: number; cost_usd: number; steps: number; repair_attempts: number; tool_call_count: number;
  denied_tool_calls: number; started_at: string; finished_at: string | null; duration_ms: number | null; context_strategy: string | null;
};
type Metrics = {
  metrics: { runs: number; completed: number; failed: number; cancelled: number; active: number; inputTokens: number; outputTokens: number; costUsd: number; avgDurationMs: number; tools: { tool: string; decision: string; count: number }[] };
  runs: RunRow[];
};

export default function ObservabilityPage() {
  const { data, loading } = useApi<Metrics>("/api/metrics", { live: true });
  const m = data?.metrics;
  const finished = m ? m.completed + m.failed : 0;
  const successRate = finished ? Math.round((m!.completed / finished) * 100) : null;
  const runs = data?.runs ?? [];

  return (
    <div className="space-y-6 pt-4">
      <div>
        <h1 className="font-display text-[clamp(2.4rem,5vw,3.6rem)] leading-none text-star">Observability</h1>
        <p className="mt-3 max-w-2xl text-[15px] text-haze">Every figure here is read from recorded runs: SDK-reported token usage and estimated cost, sandbox timings, and the tool calls the policy allowed or denied.</p>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <Stat label="Runs" value={m ? String(m.runs) : "—"} note={m ? `${m.active} active` : undefined} />
        <Stat label="Success rate" value={successRate == null ? "—" : `${successRate}%`} note={m ? `${m.completed} completed, ${m.failed} failed` : undefined} />
        <Stat label="Estimated cost" value={m ? fmtUsd(m.costUsd) : "—"} note="Agent SDK estimate" />
        <Stat label="Tokens" value={m ? fmtTokens(m.inputTokens + m.outputTokens) : "—"} note={m ? `${fmtTokens(m.inputTokens)} in, ${fmtTokens(m.outputTokens)} out` : undefined} />
        <Stat label="Avg duration" value={m ? fmtDuration(Math.round(m.avgDurationMs)) : "—"} note="Finished runs" />
        <Stat label="Tool calls" value={m ? String(m.tools.reduce((s, t) => s + t.count, 0)) : "—"} note={m ? `${m.tools.filter((t) => t.decision === "denied").reduce((s, t) => s + t.count, 0)} denied` : undefined} />
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.4fr_1fr]">
        <Panel className="p-5 sm:p-6">
          <SectionTitle title="Cost per run" hint="Most recent 30 runs, oldest on the left" />
          <CostChart runs={runs.slice(0, 30).reverse()} />
        </Panel>
        <Panel className="p-5 sm:p-6">
          <SectionTitle title="Tool usage" hint="All agents, all runs" />
          <ToolBars tools={m?.tools ?? []} />
        </Panel>
      </div>

      <Panel className="p-5 sm:p-6">
        <SectionTitle title="Run log" hint="Trace ids match OpenTelemetry spans when an OTLP endpoint is configured" />
        {!loading && runs.length === 0 && <p className="py-8 text-center text-sm text-dim">No runs recorded yet. Start a task from the workspace.</p>}
        {runs.length > 0 && (
          <div className="-mx-2 overflow-x-auto">
            <table className="w-full min-w-[920px] border-separate border-spacing-y-1 px-2 text-left text-[13px]">
              <thead className="text-dim">
                <tr>
                  {["Task", "Status", "Duration", "Tokens", "Cost", "Tools", "Repairs", "Trace"].map((h) => <th key={h} className="px-3 py-2 font-normal">{h}</th>)}
                </tr>
              </thead>
              <tbody>
                {runs.map((r) => (
                  <tr key={r.id} className="group">
                    <td className="rounded-l-2xl bg-white/[0.025] px-3 py-3 transition-colors group-hover:bg-white/[0.06]">
                      <Link href={`/app/runs/${r.id}`} className="block max-w-[320px] truncate text-star hover:underline">{r.task_title}</Link>
                      <span className="text-[12px] text-dim">{r.repo_name}, {timeAgo(r.started_at)}</span>
                    </td>
                    <td className="bg-white/[0.025] px-3 py-3 transition-colors group-hover:bg-white/[0.06]"><StatusPill status={r.status} /></td>
                    <td className="bg-white/[0.025] px-3 py-3 text-haze transition-colors group-hover:bg-white/[0.06]">{fmtDuration(r.duration_ms)}</td>
                    <td className="bg-white/[0.025] px-3 py-3 text-haze transition-colors group-hover:bg-white/[0.06]">{fmtTokens(r.input_tokens + r.output_tokens)}</td>
                    <td className="bg-white/[0.025] px-3 py-3 text-haze transition-colors group-hover:bg-white/[0.06]">{fmtUsd(r.cost_usd)}</td>
                    <td className="bg-white/[0.025] px-3 py-3 text-haze transition-colors group-hover:bg-white/[0.06]">{r.tool_call_count}{r.denied_tool_calls ? <span className="text-warn"> ({r.denied_tool_calls} denied)</span> : null}</td>
                    <td className="bg-white/[0.025] px-3 py-3 text-haze transition-colors group-hover:bg-white/[0.06]">{r.repair_attempts}</td>
                    <td className="rounded-r-2xl bg-white/[0.025] px-3 py-3 font-mono text-[11.5px] text-dim transition-colors group-hover:bg-white/[0.06]" title={r.trace_id}>{r.trace_id.slice(0, 12)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </div>
  );
}

function Stat({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div className="glass rounded-[var(--radius-card)] px-4 py-4">
      <p className="text-[12.5px] text-dim">{label}</p>
      <p className="mt-1.5 font-display text-[32px] leading-none text-star">{value}</p>
      {note && <p className="mt-2 text-[11.5px] text-dim">{note}</p>}
    </div>
  );
}

function CostChart({ runs }: { runs: RunRow[] }) {
  const [hover, setHover] = useState<number | null>(null);
  if (!runs.length) return <p className="py-16 text-center text-sm text-dim">Cost appears here once runs have used the model.</p>;
  const W = 640, H = 220, padL = 44, padB = 22, padT = 10;
  const max = Math.max(0.01, ...runs.map((r) => r.cost_usd));
  const niceMax = Math.ceil((max * 1.15) * 100) / 100;
  const bw = (W - padL) / runs.length;
  const barW = Math.max(3, Math.min(22, bw - 2));
  const ticks = [0, niceMax / 2, niceMax];
  const y = (v: number) => padT + (H - padT - padB) * (1 - v / niceMax);
  const h = hover != null ? runs[hover] : null;
  return (
    <div className="relative">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label={`Cost per run, ${runs.length} runs, maximum ${fmtUsd(max)}`} onMouseLeave={() => setHover(null)}>
        {ticks.map((t) => (
          <g key={t}>
            <line x1={padL} x2={W} y1={y(t)} y2={y(t)} stroke="rgba(246,244,255,0.07)" />
            <text x={padL - 8} y={y(t) + 4} textAnchor="end" className="fill-dim" style={{ fontSize: 11 }}>{fmtUsd(t)}</text>
          </g>
        ))}
        {runs.map((r, i) => {
          const x = padL + i * bw + (bw - barW) / 2;
          const top = y(r.cost_usd);
          const height = Math.max(r.cost_usd > 0 ? 2 : 0, H - padB - top);
          return (
            <g key={r.id} onMouseEnter={() => setHover(i)} onFocus={() => setHover(i)} tabIndex={0} aria-label={`${r.task_title}: ${fmtUsd(r.cost_usd)}`}>
              <rect x={padL + i * bw} y={padT} width={bw} height={H - padT - padB} fill="transparent" />
              <motion.rect
                x={x} width={barW} rx={Math.min(4, barW / 2)}
                initial={{ y: H - padB, height: 0 }} animate={{ y: H - padB - height, height }} transition={{ duration: 0.7, delay: i * 0.015, ease: [0.22, 1, 0.36, 1] }}
                fill={hover === i ? "#ffc0b0" : r.status === "failed" ? "rgba(255,154,130,0.45)" : "#ff9a82"}
              />
            </g>
          );
        })}
        <line x1={padL} x2={W} y1={H - padB} y2={H - padB} stroke="rgba(246,244,255,0.18)" />
      </svg>
      {h && (
        <div className="glass-strong pointer-events-none absolute right-2 top-0 max-w-[260px] rounded-2xl px-3.5 py-2.5 text-[12.5px]">
          <p className="truncate text-star">{h.task_title}</p>
          <p className="mt-0.5 text-haze">{fmtUsd(h.cost_usd)}, {fmtTokens(h.input_tokens + h.output_tokens)} tokens, {h.status}</p>
        </div>
      )}
      <p className="mt-2 text-[12px] text-dim">Lighter bars are failed runs.</p>
    </div>
  );
}

function ToolBars({ tools }: { tools: { tool: string; decision: string; count: number }[] }) {
  const byTool = new Map<string, { allowed: number; denied: number }>();
  for (const t of tools) {
    const e = byTool.get(t.tool) ?? { allowed: 0, denied: 0 };
    e[t.decision as "allowed" | "denied"] += t.count;
    byTool.set(t.tool, e);
  }
  const rows = [...byTool.entries()].sort((a, b) => b[1].allowed + b[1].denied - (a[1].allowed + a[1].denied));
  const max = Math.max(1, ...rows.map(([, v]) => v.allowed + v.denied));
  if (!rows.length) return <p className="py-16 text-center text-sm text-dim">No tool calls recorded yet.</p>;
  return (
    <ul className="space-y-3">
      {rows.map(([name, v]) => (
        <li key={name}>
          <div className="flex justify-between text-[13px]">
            <span className="font-mono text-star">{name}</span>
            <span className="text-haze">{v.allowed} allowed{v.denied ? <span className="text-warn">, {v.denied} denied</span> : ""}</span>
          </div>
          <div className="mt-1.5 flex h-2 gap-[2px] overflow-hidden rounded-full">
            <motion.div className="rounded-full bg-ember" initial={{ width: 0 }} animate={{ width: `${(v.allowed / max) * 100}%` }} transition={{ duration: 0.8 }} />
            {v.denied > 0 && <motion.div className={cn("rounded-full bg-warn")} initial={{ width: 0 }} animate={{ width: `${(v.denied / max) * 100}%` }} transition={{ duration: 0.8 }} />}
          </div>
        </li>
      ))}
    </ul>
  );
}
