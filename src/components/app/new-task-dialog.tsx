"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { api, ApiError } from "@/lib/api";
import type { RepoConnection } from "@/lib/types";
import { cn } from "@/lib/utils";

type Issue = { number: number; title: string; body: string; labels: string[]; url: string };

export function NewTaskDialog({ repos, open, onOpenChange, defaultRepoId }: { repos: RepoConnection[]; open: boolean; onOpenChange: (o: boolean) => void; defaultRepoId?: string }) {
  const router = useRouter();
  const [repoId, setRepoId] = useState(defaultRepoId ?? repos[0]?.id ?? "");
  const [mode, setMode] = useState<"freeform" | "issue">("freeform");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [issues, setIssues] = useState<Issue[] | null>(null);
  const [issueNumber, setIssueNumber] = useState<number | null>(null);
  const [planApproval, setPlanApproval] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const repo = repos.find((r) => r.id === repoId);

  useEffect(() => {
    if (open) setRepoId((id) => (defaultRepoId ?? id) || repos[0]?.id || "");
  }, [open, defaultRepoId, repos]);

  useEffect(() => {
    setIssues(null);
    setIssueNumber(null);
    if (mode !== "issue" || !repo || repo.kind !== "github") return;
    api<{ issues: Issue[] }>(`/api/repos/${repo.id}/issues`).then((d) => setIssues(d.issues)).catch((e) => setError((e as Error).message));
  }, [mode, repo]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await api<{ run: { id: string } }>("/api/tasks", {
        json: mode === "issue" ? { repoId, issueNumber, description, requirePlanApproval: planApproval } : { repoId, title, description, requirePlanApproval: planApproval },
      });
      onOpenChange(false);
      router.push(`/app/runs/${res.run.id}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not start the task");
      setBusy(false);
    }
  };

  const field = "mt-2 w-full rounded-2xl border border-white/10 bg-white/[0.04] px-4 text-star outline-none transition-colors placeholder:text-dim focus:border-ion/60 focus:bg-white/[0.07]";

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <AnimatePresence>
        {open && (
          <Dialog.Portal forceMount>
            <Dialog.Overlay asChild>
              <motion.div className="fixed inset-0 z-50 bg-[rgba(3,4,16,0.6)] backdrop-blur-sm" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} />
            </Dialog.Overlay>
            <Dialog.Content asChild>
              <motion.div
                className="glass-strong fixed left-1/2 top-1/2 z-50 max-h-[92svh] w-[calc(100vw-24px)] max-w-[620px] overflow-y-auto rounded-[var(--radius-panel)] p-6 sm:p-8"
                initial={{ opacity: 0, scale: 0.96, y: "-46%", x: "-50%" }}
                animate={{ opacity: 1, scale: 1, y: "-50%", x: "-50%" }}
                exit={{ opacity: 0, scale: 0.97, y: "-48%", x: "-50%" }}
                transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
              >
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <Dialog.Title className="font-display text-[32px] leading-none text-star">New task</Dialog.Title>
                    <Dialog.Description className="mt-2 text-sm text-haze">ForgeAI starts working as soon as you submit. Nothing is pushed until you approve.</Dialog.Description>
                  </div>
                  <Dialog.Close asChild>
                    <Button variant="ghost" size="icon" aria-label="Close"><X /></Button>
                  </Dialog.Close>
                </div>

                {repos.length === 0 ? (
                  <p className="mt-8 rounded-2xl border border-warn/30 bg-warn/10 p-4 text-sm text-warn">Connect a repository first, from the Repositories panel.</p>
                ) : (
                  <form onSubmit={submit} className="mt-7 space-y-5">
                    <div>
                      <label htmlFor="repo" className="text-[13px] text-haze">Repository</label>
                      <select id="repo" value={repoId} onChange={(e) => setRepoId(e.target.value)} className={cn(field, "h-11 appearance-none")}>
                        {repos.map((r) => (
                          <option key={r.id} value={r.id} className="bg-abyss">{r.full_name} ({r.default_branch})</option>
                        ))}
                      </select>
                    </div>

                    <div role="radiogroup" aria-label="Task source" className="inline-flex rounded-full border border-white/10 bg-white/[0.03] p-1">
                      {(["freeform", "issue"] as const).map((m) => (
                        <button
                          type="button" role="radio" aria-checked={mode === m} key={m} onClick={() => setMode(m)} disabled={m === "issue" && repo?.kind !== "github"}
                          className={cn("relative rounded-full px-4 py-1.5 text-sm transition-colors disabled:opacity-40", mode === m ? "text-star" : "text-haze hover:text-star")}
                        >
                          {mode === m && <motion.span layoutId="mode-pill" className="absolute inset-0 rounded-full bg-white/10" />}
                          <span className="relative">{m === "freeform" ? "Describe it" : "From a GitHub issue"}</span>
                        </button>
                      ))}
                    </div>

                    {mode === "freeform" ? (
                      <div>
                        <label htmlFor="title" className="text-[13px] text-haze">What should change?</label>
                        <input id="title" required minLength={3} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Fix expired sessions being treated as valid" className={cn(field, "h-11")} />
                      </div>
                    ) : (
                      <div>
                        <p className="text-[13px] text-haze">Open issues</p>
                        <div className="mt-2 max-h-56 space-y-1.5 overflow-y-auto pr-1">
                          {issues == null && <p className="text-sm text-dim">Loading issues…</p>}
                          {issues?.length === 0 && <p className="text-sm text-dim">This repository has no open issues.</p>}
                          {issues?.map((i) => (
                            <button
                              type="button" key={i.number} onClick={() => setIssueNumber(i.number)} aria-pressed={issueNumber === i.number}
                              className={cn("block w-full rounded-2xl border px-4 py-2.5 text-left text-sm transition-colors", issueNumber === i.number ? "border-ember/50 bg-ember/10 text-star" : "border-white/8 bg-white/[0.03] text-haze hover:border-white/20")}
                            >
                              <span className="text-dim">#{i.number}</span> {i.title}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}

                    <div>
                      <label htmlFor="desc" className="text-[13px] text-haze">{mode === "issue" ? "Extra guidance (optional)" : "Details, constraints and acceptance criteria"}</label>
                      <textarea id="desc" rows={5} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Sessions past expiresAt must be rejected. Keep the public API unchanged and add a regression test." className={cn(field, "resize-y py-3 leading-relaxed")} />
                    </div>

                    <label className="flex cursor-pointer items-start gap-3 rounded-2xl border border-white/8 bg-white/[0.03] p-4">
                      <input type="checkbox" checked={planApproval} onChange={(e) => setPlanApproval(e.target.checked)} className="mt-0.5 size-4 accent-[#ff9a82]" />
                      <span>
                        <span className="block text-sm text-star">Review the plan before coding starts</span>
                        <span className="block text-[13px] text-dim">The run pauses after planning until you approve.</span>
                      </span>
                    </label>

                    {error && <p role="alert" className="rounded-2xl border border-danger/30 bg-danger/10 px-4 py-3 text-sm text-danger">{error}</p>}

                    <div className="flex justify-end gap-2 pt-1">
                      <Dialog.Close asChild>
                        <Button type="button" variant="ghost">Cancel</Button>
                      </Dialog.Close>
                      <Button type="submit" variant="primary" loading={busy} disabled={mode === "issue" ? !issueNumber : title.trim().length < 3}>
                        Start task
                      </Button>
                    </div>
                  </form>
                )}
              </motion.div>
            </Dialog.Content>
          </Dialog.Portal>
        )}
      </AnimatePresence>
    </Dialog.Root>
  );
}
