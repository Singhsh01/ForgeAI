"use client";

import Link from "next/link";
import { useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { FolderGit2, Plus, GitBranch, Trash2, AlertTriangle, Hand } from "lucide-react";
import { Panel, SectionTitle } from "@/components/ui/panel";
import { GithubMark as Github } from "@/components/ui/github-mark";
import { Button } from "@/components/ui/button";
import { StatusPill, isLiveStatus } from "@/components/ui/status";
import { NewTaskDialog } from "@/components/app/new-task-dialog";
import { useApi } from "@/lib/hooks";
import { api, ApiError } from "@/lib/api";
import type { RepoConnection, RunStatus, Task } from "@/lib/types";
import { cn, fmtUsd, timeAgo } from "@/lib/utils";

type RepoRow = RepoConnection & { task_count: number; active_runs: number };
type TaskRow = Task & { repo_name: string; run_id: string | null; run_status: RunStatus | null; run_phase: string | null; run_branch: string | null; run_cost: number; run_pr_url: string | null; run_started_at: string | null };
type System = { llm: { ready: boolean; label: string; model: string; provider: string }; github: boolean; sandbox: string; sandboxHealth: { ok: boolean; detail: string }; localRepoRoots: number; githubViewer: { ok: boolean; login?: string; error?: string } | null };
type Pending = { id: string; run_id: string; kind: string; summary: string; task_title: string; created_at: string };

export default function WorkspacePage() {
  const repos = useApi<{ repos: RepoRow[] }>("/api/repos", { live: true });
  const [repoFilter, setRepoFilter] = useState<string | null>(null);
  const tasks = useApi<{ tasks: TaskRow[] }>(`/api/tasks${repoFilter ? `?repoId=${repoFilter}` : ""}`, { live: true });
  const sys = useApi<System>("/api/system");
  const pending = useApi<{ pending: Pending[] }>("/api/metrics", { live: true });
  const [dialog, setDialog] = useState(false);

  const repoList = repos.data?.repos ?? [];
  const taskList = tasks.data?.tasks ?? [];
  const activeCount = taskList.filter((t) => isLiveStatus(t.run_status)).length;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4 pt-4">
        <div>
          <h1 className="font-display text-[clamp(2.4rem,5vw,3.6rem)] leading-none text-star">Workspace</h1>
          <p className="mt-3 text-[15px] text-haze">
            {repoList.length} {repoList.length === 1 ? "repository" : "repositories"} connected · {activeCount} {activeCount === 1 ? "run" : "runs"} in progress
          </p>
        </div>
        <Button variant="primary" size="lg" onClick={() => setDialog(true)} disabled={!repoList.length}>
          <Plus /> New task
        </Button>
      </div>

      {sys.data && <SetupNotice sys={sys.data} />}

      <PendingApprovals items={pending.data?.pending ?? []} />

      <div className="grid gap-6 lg:grid-cols-[380px_1fr]">
        <Panel className="h-fit p-5 sm:p-6">
          <SectionTitle title="Repositories" hint="Select one to filter its tasks." />
          <ConnectRepo onConnected={() => repos.reload()} canGithub={!!sys.data?.github} canLocal={(sys.data?.localRepoRoots ?? 0) > 0} />
          <ul className="mt-5 space-y-2">
            {repoList.map((r) => (
              <RepoItem key={r.id} repo={r} selected={repoFilter === r.id} onSelect={() => setRepoFilter((f) => (f === r.id ? null : r.id))} onDeleted={() => { setRepoFilter(null); repos.reload(); }} />
            ))}
            {!repos.loading && repoList.length === 0 && (
              <li className="rounded-2xl border border-dashed border-white/12 p-5 text-sm leading-relaxed text-haze">
                Connect a GitHub repository by name, or a local git repository inside one of your allowed folders.
              </li>
            )}
          </ul>
        </Panel>

        <Panel className="p-5 sm:p-6">
          <SectionTitle
            title="Tasks and runs"
            hint={repoFilter ? `Showing ${repoList.find((r) => r.id === repoFilter)?.full_name}` : "Most recent first. Live runs update as they work."}
            action={repoFilter ? <Button variant="ghost" size="sm" onClick={() => setRepoFilter(null)}>Show all</Button> : undefined}
          />
          <ul className="space-y-2.5">
            <AnimatePresence initial={false}>
              {taskList.map((t) => (
                <motion.li key={t.id} layout initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}>
                  <TaskItem t={t} />
                </motion.li>
              ))}
            </AnimatePresence>
          </ul>
          {!tasks.loading && taskList.length === 0 && (
            <div className="grid place-items-center rounded-3xl border border-dashed border-white/12 px-6 py-16 text-center">
              <p className="font-display text-[26px] text-star">No tasks yet</p>
              <p className="mt-2 max-w-sm text-sm text-haze">Start with a small, well-defined change: a bug with a clear symptom, or a function that needs a test.</p>
              <Button variant="glass" className="mt-6" onClick={() => setDialog(true)} disabled={!repoList.length}><Plus /> New task</Button>
            </div>
          )}
        </Panel>
      </div>

      <NewTaskDialog repos={repoList} open={dialog} onOpenChange={setDialog} defaultRepoId={repoFilter ?? undefined} />
    </div>
  );
}

function SetupNotice({ sys }: { sys: System }) {
  const missing: string[] = [];
  if (!sys.llm.ready) missing.push(`${sys.llm.label} is not configured (${sys.llm.provider === "google" ? "GEMINI_API_KEY" : sys.llm.provider === "nvidia" ? "NVIDIA_API_KEY" : "API key"} missing), so the agents cannot run.`);
  if (!sys.sandboxHealth.ok) missing.push(`Sandbox: ${sys.sandboxHealth.detail}.`);
  if (sys.githubViewer && !sys.githubViewer.ok) missing.push(`GitHub token rejected: ${sys.githubViewer.error}`);
  if (!missing.length) return null;
  return (
    <Panel className="flex flex-col gap-3 border-warn/25 p-5 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex gap-3">
        <AlertTriangle className="mt-0.5 size-5 shrink-0 text-warn" aria-hidden />
        <div className="space-y-1 text-sm text-haze">
          {missing.map((m) => <p key={m}>{m}</p>)}
        </div>
      </div>
      <Button asChild variant="glass" size="sm"><Link href="/app/settings">Open settings</Link></Button>
    </Panel>
  );
}

function PendingApprovals({ items }: { items: Pending[] }) {
  if (!items.length) return null;
  return (
    <div className="space-y-2">
      {items.map((p) => (
        <Link key={p.id} href={`/app/runs/${p.run_id}`} className="luminous glass flex items-center justify-between gap-4 rounded-[var(--radius-card)] px-5 py-4 transition-transform hover:-translate-y-0.5">
          <span className="flex items-center gap-3">
            <Hand className="size-5 text-warn" aria-hidden />
            <span>
              <span className="block text-sm text-star">{p.kind === "plan" ? "Plan waiting for your approval" : "Ready to publish"}: {p.task_title}</span>
              <span className="block text-[13px] text-dim">{p.summary}</span>
            </span>
          </span>
          <span className="text-sm text-ember">Review</span>
        </Link>
      ))}
    </div>
  );
}

function ConnectRepo({ onConnected, canGithub, canLocal }: { onConnected: () => void; canGithub: boolean; canLocal: boolean }) {
  const [kind, setKind] = useState<"github" | "local">(canGithub || !canLocal ? "github" : "local");
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api("/api/repos", { json: kind === "github" ? { kind, fullName: value.trim() } : { kind, path: value.trim() } });
      setValue("");
      onConnected();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not connect repository");
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="rounded-[var(--radius-card)] border border-white/8 bg-white/[0.025] p-3">
      <div className="mb-2 flex gap-1">
        {(["github", "local"] as const).map((k) => (
          <button key={k} type="button" onClick={() => setKind(k)} aria-pressed={kind === k} className={cn("inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[13px] transition-colors", kind === k ? "bg-white/10 text-star" : "text-haze hover:text-star")}>
            {k === "github" ? <Github className="size-3.5" /> : <FolderGit2 className="size-3.5" />}
            {k === "github" ? "GitHub" : "Local"}
          </button>
        ))}
      </div>
      <div className="flex gap-2">
        <label className="sr-only" htmlFor="repo-input">{kind === "github" ? "owner/repo" : "Absolute path"}</label>
        <input
          id="repo-input" value={value} onChange={(e) => setValue(e.target.value)} required
          placeholder={kind === "github" ? "owner/repository" : "/path/to/repository"}
          className="h-9 min-w-0 flex-1 rounded-full border border-white/10 bg-white/[0.04] px-3.5 text-sm text-star outline-none placeholder:text-dim focus:border-ion/60"
        />
        <Button type="submit" size="sm" loading={busy} disabled={(kind === "github" && !canGithub) || (kind === "local" && !canLocal)}>Connect</Button>
      </div>
      {kind === "github" && !canGithub && <p className="mt-2 px-1 text-[12.5px] text-dim">Add FORGEAI_GITHUB_TOKEN to .env to connect GitHub repositories.</p>}
      {kind === "local" && !canLocal && <p className="mt-2 px-1 text-[12.5px] text-dim">Add a folder to FORGEAI_LOCAL_REPO_ROOTS in .env to connect local repositories.</p>}
      {error && <p role="alert" className="mt-2 px-1 text-[12.5px] text-danger">{error}</p>}
    </form>
  );
}

function RepoItem({ repo, selected, onSelect, onDeleted }: { repo: RepoRow; selected: boolean; onSelect: () => void; onDeleted: () => void }) {
  const [branches, setBranches] = useState<string[] | null>(null);
  const toggle = async () => {
    onSelect();
    if (!branches) api<{ branches: string[] }>(`/api/repos/${repo.id}/branches`).then((d) => setBranches(d.branches)).catch(() => setBranches([]));
  };
  const remove = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!window.confirm(`Disconnect ${repo.full_name}? Its tasks and run history will be deleted from ForgeAI.`)) return;
    await api(`/api/repos/${repo.id}`, { method: "DELETE" });
    onDeleted();
  };
  return (
    <li>
      <div
        role="button" tabIndex={0} onClick={toggle} onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && (e.preventDefault(), toggle())} aria-pressed={selected}
        className={cn("group w-full cursor-pointer rounded-[var(--radius-card)] border px-4 py-3 text-left transition-all duration-300", selected ? "border-ember/40 bg-ember/[0.07]" : "border-white/8 bg-white/[0.025] hover:border-white/18 hover:bg-white/[0.05]")}
      >
        <div className="flex items-center justify-between gap-2">
          <span className="flex min-w-0 items-center gap-2">
            {repo.kind === "github" ? <Github className="size-4 shrink-0 text-haze" /> : <FolderGit2 className="size-4 shrink-0 text-haze" />}
            <span className="truncate text-[14.5px] text-star">{repo.full_name}</span>
          </span>
          <button onClick={remove} aria-label={`Disconnect ${repo.full_name}`} className="rounded-full p-1 text-dim opacity-0 transition-opacity hover:text-danger focus:opacity-100 group-hover:opacity-100">
            <Trash2 className="size-3.5" />
          </button>
        </div>
        <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12.5px] text-dim">
          <span className="inline-flex items-center gap-1"><GitBranch className="size-3" />{repo.default_branch}</span>
          <span>{repo.task_count} {repo.task_count === 1 ? "task" : "tasks"}</span>
          {repo.active_runs > 0 && <span className="text-ion">{repo.active_runs} running</span>}
        </div>
        <AnimatePresence>
          {selected && branches && (
            <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
              <div className="mt-3 flex flex-wrap gap-1.5 border-t border-white/8 pt-3">
                {branches.length === 0 && <span className="text-[12.5px] text-dim">No branches found</span>}
                {branches.slice(0, 16).map((b) => (
                  <span key={b} className={cn("rounded-full border px-2 py-0.5 font-mono text-[11.5px]", b.startsWith("forgeai/") ? "border-ember/30 text-ember" : "border-white/10 text-haze")}>{b}</span>
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </li>
  );
}

function TaskItem({ t }: { t: TaskRow }) {
  const live = isLiveStatus(t.run_status);
  const inner = (
    <div className={cn("group relative rounded-[var(--radius-card)] border px-5 py-4 transition-all duration-300", live ? "luminous luminous-ion border-transparent bg-ion/[0.04]" : "border-white/8 bg-white/[0.025] hover:-translate-y-0.5 hover:border-white/18 hover:bg-white/[0.05]")}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-[15.5px] leading-snug text-star">{t.title}</p>
          <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12.5px] text-dim">
            <span>{t.repo_name}</span>
            {t.issue_number && <span>Issue #{t.issue_number}</span>}
            {t.run_branch && <span className="inline-flex items-center gap-1 font-mono text-[11.5px]"><GitBranch className="size-3" />{t.run_branch}</span>}
          </p>
        </div>
        <StatusPill status={t.run_status} />
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-[12.5px] text-haze">
        <span>{t.run_phase ?? "Not started"}</span>
        {t.run_cost > 0 && <span>{fmtUsd(t.run_cost)}</span>}
        <span>{timeAgo(t.run_started_at ?? t.created_at)}</span>
        {t.run_pr_url && <span className="text-aurora">Pull request opened</span>}
      </div>
    </div>
  );
  return t.run_id ? <Link href={`/app/runs/${t.run_id}`} className="block rounded-[var(--radius-card)]">{inner}</Link> : inner;
}
