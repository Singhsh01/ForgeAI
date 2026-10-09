"use client";

import Link from "next/link";
import { use, useEffect, useMemo, useState } from "react";
import { motion } from "motion/react";
import { DiffEditor, loader } from "@monaco-editor/react";
import { FilePlus2, FileMinus2, FilePen, GitCommitHorizontal, ShieldAlert, CheckCircle2, XCircle, Columns2, Rows2 } from "lucide-react";
import { Panel, SectionTitle } from "@/components/ui/panel";
import { Button } from "@/components/ui/button";
import { StatusPill } from "@/components/ui/status";
import { useApi } from "@/lib/hooks";
import { api } from "@/lib/api";
import type { AgentRun, ApprovalRequest, FileDiff, Task, TestResult } from "@/lib/types";
import { cn, fmtDuration } from "@/lib/utils";

loader.config({ paths: { vs: "/monaco/vs" } });

type RunDetail = { run: AgentRun; task: Task; tests: TestResult[]; approvals: ApprovalRequest[]; repo: { full_name: string; default_branch: string } | null };
type DiffResp = { files: FileDiff[]; stats: AgentRun["diff_stats"]; base: string | null; head: string | null; branch: string | null };

export default function ReviewPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const detail = useApi<RunDetail>(`/api/runs/${id}`);
  const diff = useApi<DiffResp>(`/api/runs/${id}/diff`);
  const [selected, setSelected] = useState<string | null>(null);
  const [split, setSplit] = useState(true);

  useEffect(() => {
    if (!selected && diff.data?.files.length) setSelected(diff.data.files[0].path);
  }, [diff.data, selected]);
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 900px)");
    if (mq.matches) setSplit(false);
  }, []);

  const file = diff.data?.files.find((f) => f.path === selected);
  const run = detail.data?.run;
  const review = run?.review;
  const comments = useMemo(() => (review?.comments ?? []).filter((c) => !selected || c.file === selected || !diff.data?.files.some((f) => f.path === c.file)), [review, selected, diff.data]);
  const pending = detail.data?.approvals.find((a) => a.status === "pending" && a.kind === "publish_pr");

  if (!detail.data || !diff.data) {
    return <div className="glass mt-6 h-[70vh] animate-pulse rounded-[var(--radius-panel)]" aria-busy />;
  }

  const tests = detail.data.tests.filter((t) => t.kind !== "install");

  return (
    <div className="space-y-6 pt-4">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <Link href={`/app/runs/${id}`} className="text-sm text-dim transition-colors hover:text-star">Mission control</Link>
          <h1 className="mt-2 font-display text-[clamp(2rem,4vw,3rem)] leading-[1.04] text-star">Code review</h1>
          <p className="mt-2 max-w-3xl text-[15px] text-haze">{detail.data.task.title}</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <StatusPill status={run!.status} />
          {diff.data.stats && (
            <span className="text-sm text-haze">
              {diff.data.stats.files} files <span className="text-aurora">+{diff.data.stats.additions}</span> <span className="text-danger">−{diff.data.stats.deletions}</span>
            </span>
          )}
          {pending && <PublishButtons approval={pending} onDone={() => { void detail.reload(); }} />}
        </div>
      </div>

      {diff.data.files.length === 0 ? (
        <Panel className="p-10 text-center">
          <p className="font-display text-2xl text-star">No changes recorded for this run</p>
          <p className="mt-2 text-haze">Diffs appear here once the coding agent has modified files.</p>
        </Panel>
      ) : (
        <div className="grid gap-6 xl:grid-cols-[280px_1fr]">
          {/* File explorer */}
          <Panel className="h-fit p-3">
            <p className="px-3 pb-2 pt-2 text-[13px] text-dim">Modified files</p>
            <ul role="listbox" aria-label="Modified files" className="space-y-0.5">
              {diff.data.files.map((f) => {
                const Icon = f.status === "added" ? FilePlus2 : f.status === "deleted" ? FileMinus2 : FilePen;
                const n = review?.comments.filter((c) => c.file === f.path).length ?? 0;
                return (
                  <li key={f.path} role="option" aria-selected={selected === f.path}>
                    <button onClick={() => setSelected(f.path)} className={cn("relative flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left transition-colors", selected === f.path ? "text-star" : "text-haze hover:bg-white/[0.04] hover:text-star")}>
                      {selected === f.path && <motion.span layoutId="file-pill" className="absolute inset-0 rounded-xl border border-white/10 bg-white/[0.07]" />}
                      <Icon className={cn("relative size-4 shrink-0", f.status === "added" ? "text-aurora" : f.status === "deleted" ? "text-danger" : "text-ember")} />
                      <span className="relative min-w-0 flex-1 truncate font-mono text-[12.5px]" title={f.path}>{f.path}</span>
                      {n > 0 && <span className="relative rounded-full bg-warn/15 px-1.5 text-[11px] text-warn">{n}</span>}
                      <span className="relative text-[11px] text-dim">+{f.additions}/−{f.deletions}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </Panel>

          {/* Diff */}
          <Panel className="overflow-hidden">
            <div className="flex items-center justify-between gap-3 border-b hairline px-5 py-3">
              <p className="min-w-0 truncate font-mono text-[13px] text-star">{file?.path}</p>
              <div className="flex gap-1">
                <Button variant={split ? "glass" : "ghost"} size="sm" onClick={() => setSplit(true)} aria-pressed={split}><Columns2 /> Side by side</Button>
                <Button variant={!split ? "glass" : "ghost"} size="sm" onClick={() => setSplit(false)} aria-pressed={!split}><Rows2 /> Inline</Button>
              </div>
            </div>
            <div className="h-[62vh] min-h-[420px]">
              {file && (
                <DiffEditor
                  key={file.path}
                  original={file.original}
                  modified={file.modified}
                  language={file.language}
                  theme="forge-nebula"
                  beforeMount={(m) => {
                    m.editor.defineTheme("forge-nebula", {
                      base: "vs-dark",
                      inherit: true,
                      rules: [
                        { token: "comment", foreground: "8e8bb3", fontStyle: "italic" },
                        { token: "keyword", foreground: "ff9a82" },
                        { token: "string", foreground: "9be8c8" },
                        { token: "number", foreground: "ffc876" },
                        { token: "type", foreground: "8fd0ff" },
                      ],
                      colors: {
                        "editor.background": "#070920",
                        "editorGutter.background": "#070920",
                        "editor.lineHighlightBackground": "#ffffff08",
                        "diffEditor.insertedTextBackground": "#9be8c822",
                        "diffEditor.removedTextBackground": "#ff6b7d26",
                        "diffEditor.insertedLineBackground": "#9be8c812",
                        "diffEditor.removedLineBackground": "#ff6b7d14",
                        "editorLineNumber.foreground": "#4b4970",
                        "scrollbarSlider.background": "#ffffff18",
                      },
                    });
                  }}
                  options={{
                    readOnly: true, renderSideBySide: split, minimap: { enabled: false }, fontSize: 13, fontFamily: "var(--font-geist-mono), ui-monospace, monospace",
                    scrollBeyondLastLine: false, renderOverviewRuler: false, automaticLayout: true, smoothScrolling: true, originalEditable: false, padding: { top: 12 },
                  }}
                  loading={<div className="grid h-full place-items-center text-sm text-dim">Loading diff viewer…</div>}
                />
              )}
            </div>
          </Panel>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Review */}
        <Panel className="p-5 sm:p-6 lg:col-span-2">
          <SectionTitle title="Review" hint={review ? `Verdict: ${review.verdict.replace("_", " ")}` : "The review agent has not run yet"} />
          {review && (
            <>
              <p className="text-[14.5px] leading-relaxed text-star">{review.summary}</p>
              <ul className="mt-5 space-y-2">
                {review.requirementsMet.map((r, i) => (
                  <li key={i} className="flex gap-2.5 text-sm">
                    {r.met ? <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-aurora" /> : <XCircle className="mt-0.5 size-4 shrink-0 text-danger" />}
                    <span><span className="text-star">{r.requirement}</span> <span className="text-haze">— {r.evidence}</span></span>
                  </li>
                ))}
              </ul>
              {comments.length > 0 && (
                <div className="mt-6 space-y-2.5">
                  {comments.map((c, i) => (
                    <div key={i} className={cn("rounded-2xl border px-4 py-3", c.severity === "critical" ? "border-danger/35 bg-danger/[0.07]" : c.severity === "warning" ? "border-warn/30 bg-warn/[0.06]" : "border-white/8 bg-white/[0.03]")}>
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px]">
                        <span className="font-mono text-haze">{c.file}{c.line ? `:${c.line}` : ""}</span>
                        <span className={c.severity === "critical" ? "text-danger" : c.severity === "warning" ? "text-warn" : "text-dim"}>{c.severity}</span>
                        <span className="text-dim">{c.category}</span>
                        <span className={cn("rounded-full px-2 py-px", c.basis === "verified" ? "bg-aurora/12 text-aurora" : "bg-white/8 text-haze")}>{c.basis}</span>
                      </div>
                      <p className="mt-1.5 text-[13.5px] leading-relaxed text-star">{c.body}</p>
                    </div>
                  ))}
                </div>
              )}
              {(review.securityConcerns.length > 0 || review.regressionRisks.length > 0) && (
                <div className="mt-6 grid gap-4 sm:grid-cols-2">
                  {review.securityConcerns.length > 0 && (
                    <div>
                      <p className="flex items-center gap-1.5 text-[13px] text-dim"><ShieldAlert className="size-3.5" /> Security</p>
                      <ul className="mt-2 space-y-1 text-[13px] text-haze">{review.securityConcerns.map((s, i) => <li key={i}>{s}</li>)}</ul>
                    </div>
                  )}
                  {review.regressionRisks.length > 0 && (
                    <div>
                      <p className="text-[13px] text-dim">Regression risk</p>
                      <ul className="mt-2 space-y-1 text-[13px] text-haze">{review.regressionRisks.map((s, i) => <li key={i}>{s}</li>)}</ul>
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </Panel>

        <div className="space-y-6">
          <Panel className="p-5 sm:p-6">
            <SectionTitle title="Commit" />
            <div className="flex items-start gap-2.5">
              <GitCommitHorizontal className="mt-0.5 size-4 shrink-0 text-ember" />
              <div className="min-w-0">
                <p className="whitespace-pre-wrap break-words text-sm text-star">{review?.commitMessage ?? "Not committed yet"}</p>
                <p className="mt-2 font-mono text-[11.5px] text-dim">{diff.data.branch}</p>
                <p className="font-mono text-[11.5px] text-dim">{diff.data.base?.slice(0, 8)} → {diff.data.head?.slice(0, 8) ?? "working tree"}</p>
              </div>
            </div>
            {review?.prTitle && <p className="mt-4 border-t hairline pt-3 text-[13px] text-haze">Pull request title: <span className="text-star">{review.prTitle}</span></p>}
          </Panel>
          <Panel className="p-5 sm:p-6">
            <SectionTitle title="Test results" />
            {tests.length === 0 && <p className="text-sm text-dim">No tests were executed.</p>}
            <ul className="space-y-2">
              {tests.map((t) => (
                <li key={t.id} className="flex items-center justify-between gap-3 text-[13px]">
                  <span className="min-w-0 truncate text-haze">{t.attempt === 0 ? "Baseline" : `Attempt ${t.attempt}`} · {t.kind}</span>
                  <span className={t.passed ? "text-aurora" : "text-danger"}>
                    {t.passed ? "pass" : "fail"}{t.summary ? ` ${t.summary.passed ?? 0}/${t.summary.total ?? "?"}` : ""} · {fmtDuration(t.duration_ms)}
                  </span>
                </li>
              ))}
            </ul>
          </Panel>
        </div>
      </div>
    </div>
  );
}

function PublishButtons({ approval, onDone }: { approval: ApprovalRequest; onDone: () => void }) {
  const [busy, setBusy] = useState<"y" | "n" | null>(null);
  const decide = async (approved: boolean) => {
    setBusy(approved ? "y" : "n");
    try {
      await api(`/api/approvals/${approval.id}`, { json: { approved } });
      onDone();
    } finally {
      setBusy(null);
    }
  };
  return (
    <div className="flex gap-2">
      <Button variant="primary" loading={busy === "y"} onClick={() => decide(true)}>Approve and open PR</Button>
      <Button variant="danger" loading={busy === "n"} onClick={() => decide(false)}>Reject</Button>
    </div>
  );
}
