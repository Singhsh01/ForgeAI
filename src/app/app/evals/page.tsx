"use client";

import { useState } from "react";
import { Panel, SectionTitle } from "@/components/ui/panel";
import { useApi } from "@/lib/hooks";
import { cn, fmtDuration, fmtUsd, fmtTokens } from "@/lib/utils";

type TaskDef = { id: string; category: string; title: string; acceptance: string[] };
type Result = {
  task: string; category: string; status: string; completed: boolean; hiddenPassed: number; hiddenTotal: number; unrelatedFiles: string[];
  repairIterations: number; toolFailures: number; durationMs: number; tokens: number; costUsd: number; error?: string;
};
type Report = {
  kind: "baseline-validation" | "agent-run"; suiteRunId: string; createdAt: string; model?: string; summary: Record<string, number | string>; results: Result[];
};

const CATEGORY_LABEL: Record<string, string> = { bugfix: "Bug fixing", feature: "Feature", refactor: "Refactoring", testgen: "Test generation", dependency: "Dependency change" };

export default function EvalsPage() {
  const { data } = useApi<{ reports: Report[]; tasks: TaskDef[] }>("/api/evals");
  const [sel, setSel] = useState(0);
  const reports = data?.reports ?? [];
  const report = reports[sel];
  const cats = Object.entries((data?.tasks ?? []).reduce<Record<string, number>>((m, t) => ((m[t.category] = (m[t.category] ?? 0) + 1), m), {}));

  return (
    <div className="space-y-6 pt-4">
      <div>
        <h1 className="font-display text-[clamp(2.4rem,5vw,3.6rem)] leading-none text-star">Evaluations</h1>
        <p className="mt-3 max-w-2xl text-[15px] text-haze">
          {data?.tasks.length ?? 0} reproducible tasks against a fixture repository, each graded by hidden tests. Reports below are produced by <code className="font-mono text-[13px] text-star">npm run eval</code> and <code className="font-mono text-[13px] text-star">npm run eval:validate</code>; nothing on this page is estimated.
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        {cats.map(([c, n]) => (
          <span key={c} className="glass rounded-full px-3.5 py-1.5 text-[13px] text-haze">{CATEGORY_LABEL[c] ?? c}: <span className="text-star">{n}</span></span>
        ))}
      </div>

      <Panel className="p-5 sm:p-6">
        <SectionTitle
          title="Reports"
          hint={reports.length ? undefined : "No reports yet. Run npm run eval:validate to check the suite, or npm run eval with an API key to benchmark the agents."}
          action={reports.length > 1 ? (
            <select value={sel} onChange={(e) => setSel(Number(e.target.value))} className="h-9 rounded-full border border-white/10 bg-abyss px-3 text-sm text-star" aria-label="Select report">
              {reports.map((r, i) => <option key={r.suiteRunId} value={i}>{new Date(r.createdAt).toLocaleString()} ({r.kind})</option>)}
            </select>
          ) : undefined}
        />
        {report && (
          <>
            <p className="mb-4 text-sm text-haze">
              {report.kind === "baseline-validation"
                ? "Baseline validation: confirms every hidden test fails on the untouched fixture and passes on the reference solution. It does not involve the agents."
                : `Agent benchmark with ${report.model ?? "configured model"}.`}
            </p>
            <div className="mb-5 grid grid-cols-2 gap-3 md:grid-cols-4">
              {Object.entries(report.summary).map(([k, v]) => (
                <div key={k} className="rounded-[var(--radius-card)] border border-white/8 bg-white/[0.025] px-4 py-3">
                  <p className="text-[12px] text-dim">{k}</p>
                  <p className="mt-1 font-display text-[24px] leading-none text-star">{String(v)}</p>
                </div>
              ))}
            </div>
            <div className="-mx-2 overflow-x-auto">
              <table className="w-full min-w-[860px] border-separate border-spacing-y-1 px-2 text-left text-[13px]">
                <thead className="text-dim">
                  <tr>{["Task", "Category", "Result", "Hidden tests", "Unrelated files", "Repairs", "Time", "Tokens", "Cost"].map((h) => <th key={h} className="px-3 py-2 font-normal">{h}</th>)}</tr>
                </thead>
                <tbody>
                  {report.results.map((r) => (
                    <tr key={r.task}>
                      <td className="rounded-l-2xl bg-white/[0.025] px-3 py-2.5 font-mono text-[12.5px] text-star">{r.task}</td>
                      <td className="bg-white/[0.025] px-3 py-2.5 text-haze">{CATEGORY_LABEL[r.category] ?? r.category}</td>
                      <td className={cn("bg-white/[0.025] px-3 py-2.5", r.completed ? "text-aurora" : "text-danger")} title={r.error}>{r.status}</td>
                      <td className="bg-white/[0.025] px-3 py-2.5 text-haze">{r.hiddenPassed}/{r.hiddenTotal}</td>
                      <td className={cn("bg-white/[0.025] px-3 py-2.5", r.unrelatedFiles.length ? "text-warn" : "text-haze")}>{r.unrelatedFiles.length}</td>
                      <td className="bg-white/[0.025] px-3 py-2.5 text-haze">{r.repairIterations}</td>
                      <td className="bg-white/[0.025] px-3 py-2.5 text-haze">{fmtDuration(r.durationMs)}</td>
                      <td className="bg-white/[0.025] px-3 py-2.5 text-haze">{fmtTokens(r.tokens)}</td>
                      <td className="rounded-r-2xl bg-white/[0.025] px-3 py-2.5 text-haze">{fmtUsd(r.costUsd)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </Panel>

      <Panel className="p-5 sm:p-6">
        <SectionTitle title="Task suite" hint="Each task lists the acceptance criteria its hidden tests enforce" />
        <ul className="grid gap-3 md:grid-cols-2">
          {(data?.tasks ?? []).map((t) => (
            <li key={t.id} className="rounded-[var(--radius-card)] border border-white/8 bg-white/[0.025] px-4 py-3.5">
              <div className="flex items-baseline justify-between gap-3">
                <span className="text-[14.5px] text-star">{t.title}</span>
                <span className="shrink-0 font-mono text-[11.5px] text-dim">{t.id}</span>
              </div>
              <ul className="mt-2 space-y-1">
                {t.acceptance.map((a, i) => <li key={i} className="text-[12.5px] leading-relaxed text-haze">{a}</li>)}
              </ul>
            </li>
          ))}
        </ul>
      </Panel>
    </div>
  );
}
