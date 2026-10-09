"use client";

import Link from "next/link";
import { use, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { ExternalLink, GitBranch, RotateCcw, Square, FileDiff, CircleAlert, Wrench, TerminalSquare, MessageSquareText, Flag, ShieldAlert, Coins } from "lucide-react";
import dynamic from "next/dynamic";
import { Panel, SectionTitle } from "@/components/ui/panel";
import { Button } from "@/components/ui/button";
import { StatusPill, isLiveStatus } from "@/components/ui/status";
import { stageIdFor } from "@/components/app/workflow-graph";
import { useApi, useRunEvents } from "@/lib/hooks";
import { api, ApiError } from "@/lib/api";
import type { AgentRun, ApprovalRequest, ExecutionEvent, Task, TestResult, ToolCall, AgentName } from "@/lib/types";
import { TERMINAL_STATUSES } from "@/lib/types";
import { cn, fmtDuration, fmtTokens, fmtUsd, timeAgo } from "@/lib/utils";

const WorkflowGraph = dynamic(() => import("@/components/app/workflow-graph").then((m) => m.WorkflowGraph), { ssr: false, loading: () => <div className="h-[240px]" /> });

type RunDetail = {
  run: AgentRun & { live: boolean; changed_files: { path: string; status: string; additions: number; deletions: number }[] };
  task: Task;
  repo: { id: string; kind: string; full_name: string; default_branch: string } | null;
  tests: TestResult[];
  approvals: ApprovalRequest[];
  toolCalls: ToolCall[];
};

const AGENT_TONE: Record<AgentName, string> = {
  controller: "text-haze",
  planner: "text-ion",
  coder: "text-ember",
  verifier: "text-aurora",
  reviewer: "text-plasma",
};

export default function MissionControl({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const detail = useApi<RunDetail>(`/api/runs/${id}`);
  const reloadTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const { events, connected } = useRunEvents(id, (e) => {
    if (["phase", "test", "approval", "budget", "error"].includes(e.type) || (e.type === "agent_message" && e.data)) {
      clearTimeout(reloadTimer.current);
      reloadTimer.current = setTimeout(() => void detail.reload(), 200);
    }
  });

  if (detail.error) {
    return (
      <Panel className="mx-auto mt-10 max-w-xl p-8 text-center">
        <p className="font-display text-3xl text-star">Run not available</p>
        <p className="mt-2 text-haze">{detail.error.message}</p>
        <Button asChild variant="glass" className="mt-6"><Link href="/app">Back to workspace</Link></Button>
      </Panel>
    );
  }
  if (!detail.data) return <MissionSkeleton />;

  return <MissionView d={detail.data} events={events} connected={connected} reload={detail.reload} />;
}

function MissionView({ d, events, connected, reload }: { d: RunDetail; events: ExecutionEvent[]; connected: boolean; reload: () => Promise<void> }) {
  const { run, task, repo, tests, approvals, toolCalls } = d;
  const active = !TERMINAL_STATUSES.includes(run.status);
  const pending = approvals.find((a) => a.status === "pending");
  const failedAt = useMemo(() => {
    const phases = events.filter((e) => e.type === "phase").map((e) => (e.data as { status?: string } | null)?.status).filter(Boolean) as AgentRun["status"][];
    const lastActive = [...phases].reverse().find((s) => !["failed", "cancelled", "interrupted"].includes(s));
    return lastActive ? stageIdFor(lastActive) : null;
  }, [events]);
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const act = async (key: string, fn: () => Promise<unknown>) => {
    setBusy(key);
    setErr(null);
    try {
      await fn();
      await reload();
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : (e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  // Waiting for a human is not agent time: stop the clock at the last update while paused.
  const paused = run.status === "awaiting_plan_approval" || run.status === "awaiting_publish_approval" || run.status === "interrupted";
  const elapsed = (run.finished_at ? new Date(run.finished_at).getTime() : paused ? new Date(run.updated_at).getTime() : Date.now()) - new Date(run.started_at).getTime();
  const testsRun = tests.filter((t) => t.kind !== "install");
  const latestTest = [...testsRun].reverse().find((t) => t.kind === "test");

  return (
    <div className="space-y-6 pt-4">
      {/* Header */}
      <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
        <div className="min-w-0">
          <Link href="/app" className="text-sm text-dim transition-colors hover:text-star">Workspace</Link>
          <h1 className="mt-2 max-w-4xl font-display text-[clamp(2rem,4.2vw,3.2rem)] leading-[1.02] text-star">{task.title}</h1>
          <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-[13px] text-haze">
            <StatusPill status={run.status} />
            <span>{repo?.full_name}</span>
            {run.branch && <span className="inline-flex items-center gap-1 font-mono text-[12px]"><GitBranch className="size-3.5" />{run.branch}</span>}
            <span title="OpenTelemetry trace id" className="font-mono text-[12px] text-dim">trace {run.trace_id.slice(0, 16)}</span>
            <span className={cn("inline-flex items-center gap-1.5 text-[12px]", connected ? "text-aurora" : "text-dim")}>
              <span className={cn("size-1.5 rounded-full", connected ? "bg-aurora" : "bg-dim")} />
              {connected ? "Live" : "Reconnecting"}
            </span>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {run.status === "interrupted" && (
            <Button variant="glass" loading={busy === "resume"} onClick={() => act("resume", () => api(`/api/runs/${run.id}/resume`, { method: "POST" }))}><RotateCcw /> Resume</Button>
          )}
          {(run.status === "failed" || run.status === "cancelled") && (
            <Button variant="glass" loading={busy === "rerun"} onClick={() => act("rerun", async () => { const r = await api<{ run: { id: string } }>(`/api/tasks/${task.id}/runs`, { method: "POST" }); window.location.href = `/app/runs/${r.run.id}`; })}><RotateCcw /> Run again</Button>
          )}
          {run.changed_files.length > 0 && (
            <Button asChild variant="glass"><Link href={`/app/runs/${run.id}/review`}><FileDiff /> Review changes</Link></Button>
          )}
          {run.pr_url && (
            <Button asChild variant="approve"><a href={run.pr_url} target="_blank" rel="noreferrer">Pull request #{run.pr_number} <ExternalLink /></a></Button>
          )}
          {active && (
            <Button variant="danger" loading={busy === "cancel"} onClick={() => act("cancel", () => api(`/api/runs/${run.id}/cancel`, { method: "POST" }))}><Square /> Cancel run</Button>
          )}
        </div>
      </div>

      {err && <p role="alert" className="rounded-2xl border border-danger/30 bg-danger/10 px-4 py-3 text-sm text-danger">{err}</p>}

      <AnimatePresence>{pending && <ApprovalCard key={pending.id} approval={pending} run={run} onDecided={reload} />}</AnimatePresence>

      {run.error && run.status !== "cancelled" && (
        <Panel className="flex gap-3 border-danger/30 p-5">
          <CircleAlert className="mt-0.5 size-5 shrink-0 text-danger" />
          <div>
            <p className="text-sm text-star">{run.status === "interrupted" ? "Run interrupted" : "Run stopped"}</p>
            <p className="mt-1 text-sm leading-relaxed text-haze">{run.error}</p>
          </div>
        </Panel>
      )}

      {/* Workflow graph */}
      <Panel className="overflow-hidden px-3 pb-2 pt-5 sm:px-5">
        <div className="flex flex-wrap items-baseline justify-between gap-2 px-2">
          <h2 className="font-display text-[24px] text-star">{run.phase}</h2>
          <p className="text-[13px] text-dim">{run.active_agent ? `Active agent: ${run.active_agent}` : active ? "Waiting" : `Finished ${timeAgo(run.finished_at)}`}</p>
        </div>
        <WorkflowGraph status={run.status} failedAt={failedAt} repairs={run.repair_attempts} />
      </Panel>

      {/* Budget & telemetry strip */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <Meter label="Cost" value={fmtUsd(run.cost_usd)} ratio={run.cost_usd / run.budget.maxCostUsd} cap={`of ${fmtUsd(run.budget.maxCostUsd)}`} />
        <Meter label="Steps" value={String(run.steps)} ratio={run.steps / run.budget.maxSteps} cap={`of ${run.budget.maxSteps}`} />
        <Meter label="Repair attempts" value={String(run.repair_attempts)} ratio={run.budget.maxRepairAttempts ? run.repair_attempts / run.budget.maxRepairAttempts : 0} cap={`of ${run.budget.maxRepairAttempts}`} />
        <Meter label="Tokens in / out" value={`${fmtTokens(run.input_tokens)} / ${fmtTokens(run.output_tokens)}`} ratio={run.budget.maxTokens ? (run.input_tokens + run.output_tokens) / run.budget.maxTokens : undefined} cap={run.budget.maxTokens ? `of ${fmtTokens(run.budget.maxTokens)}` : undefined} />
        <Meter label="Elapsed" value={fmtDuration(elapsed)} ratio={active ? elapsed / run.budget.timeoutMs : undefined} cap={active ? `limit ${fmtDuration(run.budget.timeoutMs)}` : undefined} />
        <Meter label="Tests" value={latestTest ? (latestTest.passed ? "Passing" : "Failing") : "Not run"} tone={latestTest ? (latestTest.passed ? "good" : "bad") : undefined} cap={latestTest?.summary ? `${latestTest.summary.passed ?? 0} passed, ${latestTest.summary.failed ?? 0} failed` : undefined} />
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.25fr_1fr]">
        <EventStream events={events} live={isLiveStatus(run.status)} />
        <div className="space-y-6">
          {run.plan && <PlanPanel plan={run.plan} />}
          <TestsPanel tests={tests} />
          <ToolsPanel calls={toolCalls} />
        </div>
      </div>
    </div>
  );
}

function Meter({ label, value, ratio, cap, tone }: { label: string; value: string; ratio?: number; cap?: string; tone?: "good" | "bad" }) {
  const r = Math.max(0, Math.min(1, ratio ?? 0));
  return (
    <div className="glass rounded-[var(--radius-card)] px-4 py-3.5">
      <p className="text-[12.5px] text-dim">{label}</p>
      <p className={cn("mt-1 font-display text-[24px] leading-none", tone === "good" ? "text-aurora" : tone === "bad" ? "text-danger" : "text-star")}>{value}</p>
      {ratio !== undefined && (
        <div className="mt-3 h-1 overflow-hidden rounded-full bg-white/8" role="meter" aria-valuenow={Math.round(r * 100)} aria-valuemin={0} aria-valuemax={100} aria-label={`${label} used`}>
          <motion.div className={cn("h-full rounded-full", r > 0.85 ? "bg-danger" : r > 0.6 ? "bg-warn" : "bg-[linear-gradient(90deg,var(--color-ember),var(--color-plasma))]")} initial={{ width: 0 }} animate={{ width: `${r * 100}%` }} transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }} />
        </div>
      )}
      {cap && <p className="mt-1.5 text-[11.5px] text-dim">{cap}</p>}
    </div>
  );
}

function ApprovalCard({ approval, run, onDecided }: { approval: ApprovalRequest; run: AgentRun; onDecided: () => Promise<void> }) {
  const [comment, setComment] = useState("");
  const [busy, setBusy] = useState<"yes" | "no" | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const decide = async (approved: boolean) => {
    setBusy(approved ? "yes" : "no");
    setErr(null);
    try {
      await api(`/api/approvals/${approval.id}`, { json: { approved, comment: comment || undefined } });
      await onDecided();
    } catch (e) {
      setErr((e as Error).message);
      setBusy(null);
    }
  };
  const isPlan = approval.kind === "plan";
  return (
    <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, height: 0 }} className="luminous glass rounded-[var(--radius-panel)] p-6 sm:p-7">
      <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
        <div className="max-w-2xl">
          <h2 className="font-display text-[28px] leading-tight text-star">{isPlan ? "Approve the plan?" : "Publish this change?"}</h2>
          <p className="mt-2 text-[15px] leading-relaxed text-haze">{approval.summary}</p>
          {!isPlan && run.review && (
            <p className="mt-3 text-sm text-haze">
              Review verdict: <span className={run.review.verdict === "approve" ? "text-aurora" : "text-warn"}>{run.review.verdict.replace("_", " ")}</span>
              {run.diff_stats && <> — {run.diff_stats.files} files, +{run.diff_stats.additions} −{run.diff_stats.deletions}</>}
            </p>
          )}
          {!isPlan && (
            <Link href={`/app/runs/${run.id}/review`} className="mt-3 inline-flex items-center gap-1.5 text-sm text-ember hover:underline"><FileDiff className="size-4" /> Inspect the diff before deciding</Link>
          )}
        </div>
        <div className="w-full space-y-3 lg:w-[340px]">
          <label htmlFor="ap-comment" className="sr-only">Comment</label>
          <input id="ap-comment" value={comment} onChange={(e) => setComment(e.target.value)} placeholder="Optional note for the audit log" className="h-10 w-full rounded-full border border-white/10 bg-white/[0.04] px-4 text-sm text-star outline-none placeholder:text-dim focus:border-ion/60" />
          <div className="flex gap-2">
            <Button variant="approve" className="flex-1" loading={busy === "yes"} onClick={() => decide(true)}>{isPlan ? "Approve plan" : "Approve and open PR"}</Button>
            <Button variant="danger" loading={busy === "no"} onClick={() => decide(false)}>Reject</Button>
          </div>
          {err && <p role="alert" className="text-sm text-danger">{err}</p>}
        </div>
      </div>
    </motion.div>
  );
}

const TYPE_ICON: Partial<Record<ExecutionEvent["type"], typeof Wrench>> = {
  tool_call: Wrench, test: TerminalSquare, agent_message: MessageSquareText, phase: Flag, error: ShieldAlert, budget: Coins, approval: Flag,
};

function EventStream({ events, live }: { events: ExecutionEvent[]; live: boolean }) {
  const [filter, setFilter] = useState<AgentName | "all">("all");
  const [showDebug, setShowDebug] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const stick = useRef(true);
  const shown = events.filter((e) => (filter === "all" || e.agent === filter) && (showDebug || e.level !== "debug"));

  useEffect(() => {
    const el = box.current;
    if (el && stick.current) el.scrollTop = el.scrollHeight;
  }, [shown.length]);

  return (
    <Panel className="flex max-h-[680px] flex-col p-5 sm:p-6">
      <SectionTitle
        title="Execution stream"
        hint={`${events.length} events recorded${live ? ", streaming" : ""}`}
        action={
          <label className="flex items-center gap-2 text-[12.5px] text-haze">
            <input type="checkbox" checked={showDebug} onChange={(e) => setShowDebug(e.target.checked)} className="accent-[#8fd0ff]" /> Sandbox output
          </label>
        }
      />
      <div className="mb-3 flex flex-wrap gap-1" role="tablist" aria-label="Filter by agent">
        {(["all", "controller", "planner", "coder", "verifier", "reviewer"] as const).map((a) => (
          <button key={a} role="tab" aria-selected={filter === a} onClick={() => setFilter(a)} className={cn("rounded-full px-3 py-1 text-[12.5px] capitalize transition-colors", filter === a ? "bg-white/10 text-star" : "text-haze hover:text-star")}>
            {a}
          </button>
        ))}
      </div>
      <div
        ref={box}
        onScroll={(e) => {
          const el = e.currentTarget;
          stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 60;
        }}
        className="-mx-2 min-h-0 flex-1 space-y-0.5 overflow-y-auto px-2"
        aria-live="polite"
        aria-relevant="additions"
      >
        {shown.length === 0 && <p className="py-10 text-center text-sm text-dim">No events yet.</p>}
        {shown.map((e) => {
          const Icon = TYPE_ICON[e.type];
          const debug = e.level === "debug";
          return (
            <motion.div key={e.seq} initial={{ opacity: 0, x: -6 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.3 }} className={cn("grid grid-cols-[56px_1fr] gap-3 rounded-xl px-2 py-1.5", e.type === "phase" && "mt-2 bg-white/[0.03]", e.level === "error" && "bg-danger/[0.08]")}>
              <span className="pt-0.5 font-mono text-[11px] text-dim">{new Date(e.created_at).toLocaleTimeString([], { hour12: false })}</span>
              <div className="min-w-0">
                <div className="flex items-start gap-2">
                  {Icon && <Icon className={cn("mt-0.5 size-3.5 shrink-0", e.level === "error" ? "text-danger" : e.level === "warn" ? "text-warn" : "text-dim")} />}
                  {debug ? (
                    <pre className="min-w-0 flex-1 overflow-x-auto whitespace-pre-wrap break-words font-mono text-[11.5px] leading-5 text-haze/80">{e.message}</pre>
                  ) : (
                    <p className={cn("min-w-0 flex-1 break-words text-[13.5px] leading-relaxed", e.type === "phase" ? "font-display text-[17px] text-star" : e.level === "error" ? "text-danger" : e.level === "warn" ? "text-warn" : "text-haze")}>
                      {e.agent && e.type !== "phase" && <span className={cn("mr-2 text-[12px] capitalize", AGENT_TONE[e.agent])}>{e.agent}</span>}
                      {e.type === "tool_call" ? <span className="font-mono text-[12.5px]">{e.message}</span> : e.message}
                    </p>
                  )}
                </div>
              </div>
            </motion.div>
          );
        })}
      </div>
    </Panel>
  );
}

function PlanPanel({ plan }: { plan: NonNullable<AgentRun["plan"]> }) {
  return (
    <Panel className="p-5 sm:p-6">
      <SectionTitle title="Plan" hint={`Uncertainty: ${plan.uncertainty}`} />
      <p className="text-[14.5px] leading-relaxed text-star">{plan.summary}</p>
      <ol className="mt-4 space-y-3">
        {plan.steps.map((s, i) => (
          <li key={i} className="grid grid-cols-[24px_1fr] gap-2">
            <span className="font-display text-lg leading-6 text-ember">{i + 1}</span>
            <div>
              <p className="text-sm text-star">{s.title}</p>
              <p className="mt-0.5 text-[13px] leading-relaxed text-haze">{s.detail}</p>
              {s.files.length > 0 && <p className="mt-1 font-mono text-[11.5px] text-dim">{s.files.join(", ")}</p>}
            </div>
          </li>
        ))}
      </ol>
      {plan.risks.length > 0 && (
        <div className="mt-5 border-t hairline pt-4">
          <p className="text-[13px] text-dim">Risks</p>
          <ul className="mt-2 space-y-1.5">
            {plan.risks.map((r, i) => (
              <li key={i} className="flex gap-2 text-[13px] text-haze">
                <span className={cn("mt-1.5 size-1.5 shrink-0 rounded-full", r.severity === "high" ? "bg-danger" : r.severity === "medium" ? "bg-warn" : "bg-dim")} />
                {r.description}
              </li>
            ))}
          </ul>
        </div>
      )}
    </Panel>
  );
}

function TestsPanel({ tests }: { tests: TestResult[] }) {
  const [open, setOpen] = useState<string | null>(null);
  return (
    <Panel className="p-5 sm:p-6">
      <SectionTitle title="Sandbox executions" hint={tests.length ? `${tests.length} commands` : "Nothing executed yet"} />
      <ul className="space-y-2">
        {tests.map((t) => (
          <li key={t.id} className="rounded-2xl border border-white/8 bg-white/[0.025]">
            <button onClick={() => setOpen((o) => (o === t.id ? null : t.id))} aria-expanded={open === t.id} className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left">
              <span className="min-w-0">
                <span className="block truncate font-mono text-[12.5px] text-star">{t.command}</span>
                <span className="block text-[12px] text-dim">
                  {t.attempt === 0 ? "baseline" : `attempt ${t.attempt}`}, {t.kind}, {fmtDuration(t.duration_ms)}, {t.sandbox}
                  {t.summary ? `, ${t.summary.passed ?? 0}/${t.summary.total ?? "?"} passed` : ""}
                </span>
              </span>
              <span className={cn("shrink-0 rounded-full px-2.5 py-0.5 text-xs", t.passed ? "bg-aurora/15 text-aurora" : "bg-danger/15 text-danger")}>{t.timed_out ? "timeout" : t.passed ? "pass" : `exit ${t.exit_code}`}</span>
            </button>
            <AnimatePresence>
              {open === t.id && t.output_tail && (
                <motion.pre initial={{ height: 0 }} animate={{ height: "auto" }} exit={{ height: 0 }} className="max-h-72 overflow-auto border-t hairline px-4 py-3 font-mono text-[11.5px] leading-5 text-haze">
                  {t.output_tail.slice(-8000)}
                </motion.pre>
              )}
            </AnimatePresence>
          </li>
        ))}
      </ul>
    </Panel>
  );
}

function ToolsPanel({ calls }: { calls: ToolCall[] }) {
  const counts = calls.reduce<Record<string, { allowed: number; denied: number }>>((m, c) => {
    m[c.tool_name] ??= { allowed: 0, denied: 0 };
    m[c.tool_name][c.decision]++;
    return m;
  }, {});
  const entries = Object.entries(counts).sort((a, b) => b[1].allowed + b[1].denied - (a[1].allowed + a[1].denied));
  const max = Math.max(1, ...entries.map(([, v]) => v.allowed + v.denied));
  return (
    <Panel className="p-5 sm:p-6">
      <SectionTitle title="Tool calls" hint={`${calls.length} total, ${calls.filter((c) => c.decision === "denied").length} denied by policy`} />
      {entries.length === 0 && <p className="text-sm text-dim">Agents have not used any tools yet.</p>}
      <ul className="space-y-2.5">
        {entries.map(([name, v]) => (
          <li key={name}>
            <div className="flex justify-between text-[13px]">
              <span className="font-mono text-star">{name}</span>
              <span className="text-dim">{v.allowed}{v.denied ? <span className="text-warn">, {v.denied} denied</span> : null}</span>
            </div>
            <div className="mt-1.5 flex h-1.5 overflow-hidden rounded-full bg-white/[0.06]">
              <motion.div className="bg-[linear-gradient(90deg,var(--color-ember),var(--color-plasma))]" initial={{ width: 0 }} animate={{ width: `${(v.allowed / max) * 100}%` }} />
              <motion.div className="bg-warn" initial={{ width: 0 }} animate={{ width: `${(v.denied / max) * 100}%` }} />
            </div>
          </li>
        ))}
      </ul>
    </Panel>
  );
}

function MissionSkeleton() {
  return (
    <div className="space-y-6 pt-4" aria-busy>
      <div className="h-4 w-24 animate-pulse rounded bg-white/10" />
      <div className="h-12 w-2/3 animate-pulse rounded-2xl bg-white/10" />
      <div className="glass h-[280px] animate-pulse rounded-[var(--radius-panel)]" />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-6">{Array.from({ length: 6 }).map((_, i) => <div key={i} className="glass h-24 animate-pulse rounded-[var(--radius-card)]" />)}</div>
    </div>
  );
}
