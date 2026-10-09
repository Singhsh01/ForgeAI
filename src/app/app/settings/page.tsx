"use client";

import { CheckCircle2, CircleAlert } from "lucide-react";
import { Panel, SectionTitle } from "@/components/ui/panel";
import { useApi } from "@/lib/hooks";
import { fmtDuration, fmtUsd } from "@/lib/utils";

type System = {
  llm: { provider: string; label: string; model: string; ready: boolean; baseUrl: string | null }; github: boolean; database: string; sandbox: string; sandboxImage: string; model: string; localRepoRoots: number; otlp: boolean;
  budget: { maxCostUsd: number; maxRepairAttempts: number; maxAgentTurns: number; maxSteps: number; timeoutMs: number; maxTokens: number };
  sandboxHealth: { ok: boolean; detail: string }; githubViewer: { ok: boolean; login?: string; error?: string } | null;
};

export default function SettingsPage() {
  const { data: s } = useApi<System>("/api/system");
  const rows: { name: string; ok: boolean; detail: string; fix?: string }[] = s
    ? [
        { name: `Model: ${s.llm.label}`, ok: s.llm.ready, detail: `${s.llm.model}${s.llm.baseUrl ? ` via ${new URL(s.llm.baseUrl).host}` : ""}${s.llm.ready ? "" : " (no API key)"}`, fix: s.llm.provider === "google" ? "Set GEMINI_API_KEY (free key from Google AI Studio)" : s.llm.provider === "nvidia" ? "Set NVIDIA_API_KEY (free key from build.nvidia.com)" : "Set the API key for FORGEAI_LLM_PROVIDER" },
        { name: "GitHub", ok: !!s.githubViewer?.ok, detail: s.githubViewer?.ok ? `Signed in as ${s.githubViewer.login}` : s.github ? `Token rejected: ${s.githubViewer?.error}` : "No token, GitHub repositories unavailable", fix: "Set FORGEAI_GITHUB_TOKEN (fine-grained, scoped to the repos you connect)" },
        { name: "Execution sandbox", ok: s.sandboxHealth.ok && s.sandbox === "docker", detail: `${s.sandbox} driver: ${s.sandboxHealth.detail}`, fix: s.sandbox === "docker" ? "Install Docker and run npm run sandbox:build" : "The process driver provides no isolation; switch FORGEAI_SANDBOX_DRIVER to docker" },
        { name: "Database", ok: true, detail: s.database === "pglite" ? "Embedded PGlite (Postgres) in .forgeai/pgdata" : "PostgreSQL via DATABASE_URL" },
        { name: "Local repositories", ok: s.localRepoRoots > 0, detail: s.localRepoRoots ? `${s.localRepoRoots} allowed root folder(s)` : "None allowed", fix: "Set FORGEAI_LOCAL_REPO_ROOTS to folders ForgeAI may read" },
        { name: "Trace export", ok: s.otlp, detail: s.otlp ? "OTLP endpoint configured" : "Trace ids are recorded locally only", fix: "Set OTEL_EXPORTER_OTLP_ENDPOINT to export spans" },
      ]
    : [];
  return (
    <div className="space-y-6 pt-4">
      <div>
        <h1 className="font-display text-[clamp(2.4rem,5vw,3.6rem)] leading-none text-star">Settings</h1>
        <p className="mt-3 max-w-2xl text-[15px] text-haze">Configuration lives in <code className="font-mono text-[13px] text-star">.env</code> on the machine running ForgeAI. Secrets are never sent to this page.</p>
      </div>
      <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
        <Panel className="p-5 sm:p-6">
          <SectionTitle title="Integrations" />
          <ul className="space-y-2.5">
            {rows.map((r) => (
              <li key={r.name} className="flex gap-3 rounded-[var(--radius-card)] border border-white/8 bg-white/[0.025] px-4 py-3.5">
                {r.ok ? <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-aurora" /> : <CircleAlert className="mt-0.5 size-4 shrink-0 text-warn" />}
                <div>
                  <p className="text-sm text-star">{r.name}</p>
                  <p className="mt-0.5 text-[13px] text-haze">{r.detail}</p>
                  {!r.ok && r.fix && <p className="mt-1 text-[12.5px] text-dim">{r.fix}</p>}
                </div>
              </li>
            ))}
          </ul>
        </Panel>
        <Panel className="h-fit p-5 sm:p-6">
          <SectionTitle title="Run budgets" hint="Enforced by the workflow controller on every run" />
          {s && (
            <dl className="grid grid-cols-2 gap-3">
              {[
                ["Cost cap", fmtUsd(s.budget.maxCostUsd)],
                ["Token cap", s.budget.maxTokens.toLocaleString("en")],
                ["Repair attempts", String(s.budget.maxRepairAttempts)],
                ["Turns per agent", String(s.budget.maxAgentTurns)],
                ["Steps per run", String(s.budget.maxSteps)],
                ["Timeout", fmtDuration(s.budget.timeoutMs)],
                ["Sandbox image", s.sandboxImage],
              ].map(([k, v]) => (
                <div key={k} className="rounded-[var(--radius-card)] border border-white/8 bg-white/[0.025] px-4 py-3">
                  <dt className="text-[12px] text-dim">{k}</dt>
                  <dd className="mt-1 truncate text-[15px] text-star">{v}</dd>
                </div>
              ))}
            </dl>
          )}
        </Panel>
      </div>
    </div>
  );
}
