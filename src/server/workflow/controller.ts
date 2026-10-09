import fs from "node:fs";
import path from "node:path";
import type { AgentName, AgentRun, RunStatus } from "@/lib/types";
import { TERMINAL_STATUSES } from "@/lib/types";
import * as store from "../db/store";
import { emit, notifyGlobal } from "../events";
import { config } from "../config";
import { logger } from "../logger";
import { tracer } from "../telemetry";
import * as gitx from "../git";
import { githubToken, createPullRequest, getIssue } from "../github";
import { runInSandbox, sandboxDescription } from "../sandbox";
import { detectProject, parseTestSummary } from "../sandbox/project";
import { buildContext } from "../context";
import * as roles from "../agents/roles";
import type { RoleHooks } from "../agents/roles";
import type { PlanOut } from "../agents/schemas";
import { assertTransition, PHASE_LABEL } from "./states";

/**
 * Workflow controller. Owns a single run end-to-end and is the only component allowed to
 * change run state. Agents never talk to each other directly: the controller sequences
 * them, enforces budgets (steps, cost, repair attempts, wall-clock), executes all code in
 * the sandbox, and pauses at human approval checkpoints.
 */

export class BudgetExceeded extends Error {}
export class Cancelled extends Error {}

export type StartFrom = "preparing" | "coding" | "publishing";

export class RunController {
  readonly abort = new AbortController();
  private run!: AgentRun;
  private startedAt = Date.now();

  constructor(readonly runId: string) {}

  // ── helpers ──────────────────────────────────────────────────────────
  private async refresh() {
    const r = await store.getRun(this.runId);
    if (!r) throw new Error(`Run ${this.runId} not found`);
    this.run = r;
    return r;
  }

  private async setStatus(to: RunStatus, extra: Partial<AgentRun> = {}) {
    await this.refresh();
    if (this.run.status === to) {
      if (Object.keys(extra).length) await store.updateRun(this.runId, extra);
      return;
    }
    assertTransition(this.run.status, to);
    const terminal = TERMINAL_STATUSES.includes(to);
    await store.updateRun(this.runId, {
      status: to,
      phase: PHASE_LABEL[to],
      ...(terminal ? { finished_at: new Date().toISOString(), active_agent: null } : {}),
      ...extra,
    });
    this.run = { ...this.run, status: to, ...extra };
    await emit(this.runId, { type: "phase", agent: "controller", message: PHASE_LABEL[to], data: { status: to } });
    notifyGlobal("run", { runId: this.runId, status: to });
  }

  private log(agent: AgentName, message: string, data?: Record<string, unknown>, level: "info" | "warn" | "error" | "debug" = "info") {
    return emit(this.runId, { type: "log", agent, message, data, level });
  }

  private checkBudget(stage: string) {
    if (this.abort.signal.aborted) throw new Cancelled("Run cancelled");
    const b = this.run.budget;
    if (Date.now() - this.startedAt > b.timeoutMs) throw new BudgetExceeded(`Run exceeded its ${Math.round(b.timeoutMs / 60000)} minute timeout during ${stage}`);
    if (this.run.cost_usd >= b.maxCostUsd) throw new BudgetExceeded(`Cost budget $${b.maxCostUsd} exhausted before ${stage}`);
    if (this.run.steps >= b.maxSteps) throw new BudgetExceeded(`Step budget (${b.maxSteps}) exhausted before ${stage}`);
    if (b.maxTokens && this.run.input_tokens + this.run.output_tokens >= b.maxTokens) throw new BudgetExceeded(`Token budget (${b.maxTokens.toLocaleString("en")}) exhausted before ${stage}`);
  }

  private hooks(agent: AgentName): RoleHooks {
    return {
      signal: this.abort.signal,
      maxTurns: this.run.budget.maxAgentTurns,
      maxBudgetUsd: Math.max(0.05, this.run.budget.maxCostUsd - this.run.cost_usd),
      onToolCall: async (e) => {
        await store.recordToolCall({ runId: this.runId, agent, toolName: e.tool, input: e.input, decision: e.allowed ? "allowed" : "denied", denyReason: e.reason });
        const steps = await store.incrementSteps(this.runId);
        this.run.steps = steps;
        await emit(this.runId, {
          type: "tool_call",
          agent,
          level: e.allowed ? "info" : "warn",
          message: `${e.tool}${describeInput(e.input, this.run.workspace_path)}${e.allowed ? "" : ` — denied: ${e.reason}`}`,
          data: { tool: e.tool, allowed: e.allowed, input: e.input },
        });
        if (steps >= this.run.budget.maxSteps) this.abort.abort();
      },
      onText: async (text) => {
        await emit(this.runId, { type: "agent_message", agent, message: text.slice(0, 4000) });
      },
      onUsage: async (a, r) => {
        await store.addRunUsage(this.runId, { input: r.usage.inputTokens, output: r.usage.outputTokens, cacheRead: r.usage.cacheReadTokens, cost: r.usage.costUsd, steps: 1 });
        await this.refresh();
        await emit(this.runId, {
          type: "budget",
          agent: a,
          message: `${a} used ${r.usage.inputTokens + r.usage.outputTokens} tokens · $${r.usage.costUsd.toFixed(4)} · ${r.usage.turns} turns (${r.stopReason})`,
          data: { ...r.usage, stopReason: r.stopReason, runCost: this.run.cost_usd },
        });
      },
    };
  }

  private async agentPhase<T>(agent: AgentName, label: string, fn: () => Promise<T>): Promise<T> {
    this.checkBudget(label);
    await store.updateRun(this.runId, { active_agent: agent });
    return tracer().startActiveSpan(`agent.${agent}`, { attributes: { "forgeai.run_id": this.runId, "forgeai.agent": agent } }, async (span) => {
      try {
        await this.log(agent, `${label} started`);
        return await fn();
      } catch (e) {
        span.recordException(e as Error);
        throw e;
      } finally {
        span.end();
      }
    });
  }

  private async sandbox(kind: "install" | "test" | "lint", command: string, attempt: number, network: boolean) {
    this.checkBudget(`${kind} in sandbox`);
    await store.updateRun(this.runId, { active_agent: "verifier" });
    await emit(this.runId, { type: "log", agent: "verifier", message: `$ ${command}`, data: { kind, sandbox: sandboxDescription(), network } });
    let buffer = "";
    let last = Date.now();
    const flush = async () => {
      if (!buffer.trim()) return;
      const chunk = buffer;
      buffer = "";
      await emit(this.runId, { type: "log", agent: "verifier", level: "debug", message: chunk.slice(-3000), data: { stream: kind } });
    };
    const res = await runInSandbox({
      workspace: this.run.workspace_path!,
      command,
      network,
      signal: this.abort.signal,
      onOutput: (s) => {
        buffer += s;
        if (Date.now() - last > 1200) {
          last = Date.now();
          void flush();
        }
      },
    });
    await flush();
    if (res.cancelled) throw new Cancelled("Run cancelled");
    const summary = kind === "test" ? parseTestSummary(res.output) : null;
    const passed = res.exitCode === 0 && !res.timedOut;
    await store.recordTestResult({
      run_id: this.runId, attempt, kind, command, sandbox: res.driver, exit_code: res.exitCode, passed, timed_out: res.timedOut,
      duration_ms: res.durationMs, summary, output_tail: res.output.slice(-20000),
    });
    await emit(this.runId, {
      type: "test",
      agent: "verifier",
      level: passed ? "info" : "warn",
      message: `${kind} ${passed ? "passed" : res.timedOut ? "timed out" : `failed (exit ${res.exitCode})`} in ${(res.durationMs / 1000).toFixed(1)}s${summary ? ` — ${summary.passed ?? 0} passed, ${summary.failed ?? 0} failed` : ""}`,
      data: { kind, attempt, passed, exitCode: res.exitCode, durationMs: res.durationMs, summary },
    });
    return { ...res, passed, summary };
  }

  private async snapshotDiff() {
    const ws = this.run.workspace_path!;
    const diffs = await gitx.fileDiffs(ws, this.run.base_sha!);
    const stats = { files: diffs.length, additions: diffs.reduce((s, d) => s + d.additions, 0), deletions: diffs.reduce((s, d) => s + d.deletions, 0) };
    await store.updateRun(this.runId, { diff_snapshot: diffs, diff_stats: stats });
    return { diffs, stats };
  }

  // ── main entry ───────────────────────────────────────────────────────
  async execute(from: StartFrom = "preparing") {
    await this.refresh();
    this.startedAt = Date.now(); // wall-clock budget applies to each active segment (not time spent waiting for a human)
    const span = tracer().startSpan("forgeai.run", { attributes: { "forgeai.run_id": this.runId, "forgeai.start_from": from } });
    try {
      const task = await store.getTask(this.run.task_id);
      if (!task) throw new Error("Task not found");
      const repo = await store.getRepo(task.repo_id);
      if (!repo) throw new Error("Repository connection not found");

      let plan = this.run.plan as PlanOut | null;
      let issueText: string | undefined;
      if (task.source === "issue" && task.issue_number && repo.kind === "github") {
        issueText = await getIssue(repo.full_name, task.issue_number).then((i) => `#${i.number} ${i.title}\n\n${i.body}`).catch(() => undefined);
      }
      const taskText = `${task.title}\n\n${task.description}`;

      if (from === "publishing") return await this.publish();

      if (from === "preparing") {
        await this.setStatus("preparing");
        await this.prepare(repo, task.title);
        await this.setStatus("planning");
        await this.refresh();
        const ctx = await buildContext(this.run.workspace_path!, `${taskText}\n${issueText ?? ""}`);
        await store.updateRun(this.runId, { context_strategy: ctx.strategy });
        await this.log("planner", `Context selected with ${ctx.strategy}: ${ctx.files.length} ranked files, ~${ctx.approxTokens} tokens`, {
          files: ctx.files.map((f) => ({ path: f.path, score: f.score })),
          terms: ctx.terms,
        });
        plan = await this.agentPhase("planner", "Planning", () => roles.plan({ cwd: this.run.workspace_path!, task: taskText, issueText, context: ctx.text }, this.hooks("planner")));
        await store.updateRun(this.runId, { plan });
        await emit(this.runId, { type: "agent_message", agent: "planner", message: `Plan ready: ${plan.summary}`, data: { plan } });

        if (task.require_plan_approval) {
          const ap = await store.createApproval({ runId: this.runId, kind: "plan", summary: plan.summary, payload: { plan } });
          await this.setStatus("awaiting_plan_approval");
          await emit(this.runId, { type: "approval", agent: "controller", message: "Plan approval requested", data: { approvalId: ap.id, kind: "plan" } });
          return;
        }
      } else {
        // Resume (after plan approval or an interruption): restore a clean workspace from base.
        if (!plan) throw new Error("Cannot resume coding without a plan");
        if (!this.run.workspace_path || !fs.existsSync(this.run.workspace_path)) {
          await this.setStatus("preparing");
          await this.prepare(repo, task.title);
          await this.setStatus("planning").catch(() => undefined);
        } else if (this.run.status === "interrupted") {
          await gitx.resetHard(this.run.workspace_path, this.run.base_sha!);
          await this.log("controller", "Workspace reset to base commit for resume");
        }
      }

      await this.implementAndVerify(taskText, plan!);
      await this.reviewAndRequestPublish(taskText, plan!);
    } catch (e) {
      await this.fail(e as Error);
    } finally {
      span.end();
    }
  }

  private async prepare(repo: { kind: "github" | "local"; clone_url: string; default_branch: string; full_name: string }, title: string) {
    const ws = path.join(config().workspacesDir, this.runId);
    fs.rmSync(ws, { recursive: true, force: true });
    await this.log("controller", `Cloning ${repo.full_name} (${repo.default_branch}) into a disposable workspace`);
    const baseSha = await gitx.cloneRepo({ source: repo.clone_url, dest: ws, branch: repo.default_branch, auth: repo.kind === "github" ? { token: githubToken() } : undefined, depth: 50 });
    const branch = `forgeai/${slug(title)}-${this.runId.slice(-6)}`;
    await gitx.createBranch(ws, branch);
    const project = detectProject(ws);
    await store.updateRun(this.runId, { workspace_path: ws, base_sha: baseSha, branch, project });
    this.run = { ...this.run, workspace_path: ws, base_sha: baseSha, branch, project };
    await this.log("controller", `Workspace ready on branch ${branch} @ ${baseSha.slice(0, 8)} — detected ${project.ecosystem} project`, { project });
    if (project.install) {
      const r = await this.sandbox("install", project.install, 0, config().sandbox.installNetwork);
      if (!r.passed) throw new Error(`Dependency installation failed in sandbox (exit ${r.exitCode})`);
    }
    if (project.test) {
      const base = await this.sandbox("test", project.test, 0, false);
      await this.log("verifier", base.passed ? "Baseline test suite passes before any change" : "Baseline test suite already fails before any change — failures will be compared, not blamed on the patch", { baseline: base.summary }, base.passed ? "info" : "warn");
    } else {
      await this.log("verifier", "No test command detected; verification will rely on review only", undefined, "warn");
    }
  }

  private async implementAndVerify(taskText: string, plan: PlanOut) {
    const project = this.run.project ?? detectProject(this.run.workspace_path!);
    let feedback: (Awaited<ReturnType<typeof roles.diagnose>> & { output: string }) | undefined;
    for (let attempt = 1; ; attempt++) {
      await this.setStatus("coding");
      const report = await this.agentPhase("coder", attempt === 1 ? "Implementation" : `Repair attempt ${attempt - 1}`, () =>
        roles.code({ cwd: this.run.workspace_path!, task: taskText, plan, feedback, attempt: attempt - 1 }, this.hooks("coder")),
      );
      await emit(this.runId, { type: "agent_message", agent: "coder", message: report.summary, data: { report } });

      await this.setStatus("verifying");
      const { stats } = await this.snapshotDiff();
      if (stats.files === 0) throw new Error("The coding agent finished without modifying any files");
      await this.log("verifier", `Diff: ${stats.files} files, +${stats.additions} −${stats.deletions}`);

      let failure: { command: string; output: string } | undefined;
      if (project.test) {
        const t = await this.sandbox("test", project.test, attempt, false);
        if (!t.passed) failure = { command: project.test, output: t.output };
      }
      if (!failure && project.lint) {
        const l = await this.sandbox("lint", project.lint, attempt, false);
        if (!l.passed) failure = { command: project.lint, output: l.output };
      }
      if (!failure) {
        await this.log("verifier", "Verification passed");
        return;
      }
      await this.refresh();
      if (this.run.repair_attempts >= this.run.budget.maxRepairAttempts) {
        throw new Error(`Verification still failing after ${this.run.repair_attempts} repair attempt(s); stopping (maxRepairAttempts=${this.run.budget.maxRepairAttempts})`);
      }
      await this.setStatus("repairing", { repair_attempts: this.run.repair_attempts + 1 });
      const diff = await gitx.unifiedDiff(this.run.workspace_path!, this.run.base_sha!);
      const fb = await this.agentPhase("verifier", "Failure diagnosis", () =>
        roles.diagnose({ cwd: this.run.workspace_path!, task: taskText, command: failure!.command, output: failure!.output, diff }, this.hooks("verifier")),
      );
      await emit(this.runId, { type: "agent_message", agent: "verifier", level: "warn", message: `Root cause: ${fb.rootCause}`, data: { feedback: fb } });
      if (fb.isEnvironmentalFailure && fb.confidence === "high") throw new Error(`Environmental failure, not retrying: ${fb.rootCause}`);
      feedback = { ...fb, output: failure.output };
    }
  }

  private async reviewAndRequestPublish(taskText: string, plan: PlanOut) {
    await this.setStatus("reviewing");
    const diff = await gitx.unifiedDiff(this.run.workspace_path!, this.run.base_sha!);
    const tests = await store.listTestResults(this.runId);
    const evidence = tests.length
      ? tests.map((t) => `- [attempt ${t.attempt}] ${t.kind}: \`${t.command}\` → ${t.passed ? "PASS" : "FAIL"} (exit ${t.exit_code}, ${t.duration_ms}ms${t.summary ? `, ${t.summary.passed ?? 0} passed / ${t.summary.failed ?? 0} failed` : ""})`).join("\n")
      : "No automated tests were available.";
    const review = await this.agentPhase("reviewer", "Code review", () => roles.review({ cwd: this.run.workspace_path!, task: taskText, plan, diff, testEvidence: evidence }, this.hooks("reviewer")));
    await store.updateRun(this.runId, { review });
    await emit(this.runId, { type: "agent_message", agent: "reviewer", message: `Review verdict: ${review.verdict} — ${review.summary}`, data: { review } });

    const head = await gitx.commitAll(this.run.workspace_path!, `${review.commitMessage}\n\nGenerated by ForgeAI run ${this.runId} (trace ${this.run.trace_id})`);
    await store.updateRun(this.runId, { head_sha: head });
    await this.log("controller", `Committed ${head.slice(0, 8)} on ${this.run.branch} (local only — nothing published yet)`);

    const ap = await store.createApproval({
      runId: this.runId,
      kind: "publish_pr",
      summary: `Push ${this.run.branch} and open a draft pull request: "${review.prTitle}"`,
      payload: { prTitle: review.prTitle, verdict: review.verdict, branch: this.run.branch },
    });
    await this.setStatus("awaiting_publish_approval", { active_agent: null });
    await emit(this.runId, { type: "approval", agent: "controller", message: "Approval required before publishing a pull request", data: { approvalId: ap.id, kind: "publish_pr" } });
  }

  async publish() {
    try {
      await this.refresh();
      await this.setStatus("publishing");
      const task = (await store.getTask(this.run.task_id))!;
      const repo = (await store.getRepo(task.repo_id))!;
      const ws = this.run.workspace_path!;
      if (!ws || !fs.existsSync(ws)) throw new Error("Workspace no longer exists; cannot publish");
      const review = this.run.review!;
      const tests = await store.listTestResults(this.runId);
      if (repo.kind === "github") {
        await gitx.pushBranch(ws, this.run.branch!, { token: githubToken() });
        const pr = await createPullRequest({ fullName: repo.full_name, head: this.run.branch!, base: repo.default_branch, title: review.prTitle, body: prBody(this.run, task, tests), draft: true });
        await this.setStatus("completed", { pr_url: pr.url, pr_number: pr.number });
        await this.log("controller", `Draft pull request #${pr.number} opened`, { url: pr.url });
      } else {
        await gitx.pushBranch(ws, this.run.branch!);
        await this.setStatus("completed");
        await this.log("controller", `Branch ${this.run.branch} pushed to local repository ${repo.clone_url}`);
      }
      await store.audit({ action: "run.published", targetType: "run", targetId: this.runId, details: { repo: repo.full_name, branch: this.run.branch } });
      this.cleanup();
    } catch (e) {
      await this.fail(e as Error);
    }
  }

  async fail(e: Error) {
    await this.refresh().catch(() => undefined);
    if (TERMINAL_STATUSES.includes(this.run.status)) return;
    if (e instanceof Cancelled || this.abort.signal.aborted && !(e instanceof BudgetExceeded) && !/Step budget/.test(e.message)) {
      if (this.run.status !== "cancelled") {
        await store.updateRun(this.runId, { status: "cancelled", phase: PHASE_LABEL.cancelled, finished_at: new Date().toISOString(), active_agent: null, error: "Cancelled by operator" });
        await emit(this.runId, { type: "phase", agent: "controller", message: "Cancelled", data: { status: "cancelled" } });
      }
    } else {
      const msg = this.run.steps >= this.run.budget.maxSteps ? `Step budget (${this.run.budget.maxSteps}) exhausted` : e.message;
      logger.warn({ runId: this.runId, err: msg }, "run failed");
      await store.updateRun(this.runId, { status: "failed", phase: PHASE_LABEL.failed, finished_at: new Date().toISOString(), active_agent: null, error: msg.slice(0, 4000) });
      await emit(this.runId, { type: "error", agent: "controller", level: "error", message: msg, data: { name: e.name } });
      await emit(this.runId, { type: "phase", agent: "controller", message: "Failed", data: { status: "failed" } });
    }
    await store.expireApprovals(this.runId);
    notifyGlobal("run", { runId: this.runId });
    this.cleanup();
  }

  /** Disposable workspaces are deleted when a run reaches a terminal state (diffs are snapshotted in the DB). */
  cleanup() {
    const ws = this.run?.workspace_path;
    if (ws && ws.startsWith(config().workspacesDir) && fs.existsSync(ws)) {
      fs.rmSync(ws, { recursive: true, force: true });
      void this.log("controller", "Disposable workspace removed");
    }
  }
}

function slug(s: string) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "task";
}

function describeInput(input: Record<string, unknown>, workspace?: string | null) {
  const p = input.file_path ?? input.path ?? input.pattern;
  if (typeof p !== "string") return "";
  return ` ${workspace && p.startsWith(workspace + path.sep) ? path.relative(workspace, p) : p}`;
}

function prBody(run: AgentRun, task: { title: string; description: string; issue_number: number | null }, tests: Awaited<ReturnType<typeof store.listTestResults>>) {
  const r = run.review!;
  const p = run.plan!;
  const testRows = tests
    .filter((t) => t.kind !== "install")
    .map((t) => `| ${t.attempt === 0 ? "baseline" : t.attempt} | ${t.kind} | \`${t.command}\` | ${t.passed ? "✅ pass" : "❌ fail"} | ${t.summary ? `${t.summary.passed ?? 0}/${t.summary.total ?? "?"}` : "–"} | ${(t.duration_ms / 1000).toFixed(1)}s |`)
    .join("\n");
  return `## Summary
${p.summary}

${task.issue_number ? `Closes #${task.issue_number}\n` : ""}
## Plan
${p.steps.map((s, i) => `${i + 1}. **${s.title}** — ${s.detail}`).join("\n")}

## Test evidence (executed in an isolated sandbox by ForgeAI)
| Attempt | Kind | Command | Result | Passed | Duration |
|---|---|---|---|---|---|
${testRows || "| – | – | no tests detected | – | – | – |"}

Repair iterations: ${run.repair_attempts}

## Automated review — ${r.verdict}
${r.summary}

${r.requirementsMet.map((q) => `- [${q.met ? "x" : " "}] ${q.requirement} — ${q.evidence}`).join("\n")}

${r.securityConcerns.length ? `**Security notes**\n${r.securityConcerns.map((s) => `- ${s}`).join("\n")}` : ""}

---
<sub>ForgeAI run \`${run.id}\` · trace \`${run.trace_id}\` · model \`${run.model}\` · cost ≈ $${run.cost_usd.toFixed(4)} · context ${run.context_strategy ?? "n/a"}. Review all changes before merging.</sub>`;
}
