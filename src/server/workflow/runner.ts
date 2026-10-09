import fs from "node:fs";
import * as store from "../db/store";
import { emit, notifyGlobal } from "../events";
import { config } from "../config";
import { logger } from "../logger";
import { tracer } from "../telemetry";
import { RunController, type StartFrom } from "./controller";
import { TERMINAL_STATUSES } from "@/lib/types";

/**
 * In-process job runner. Runs are durable in the database; this module only holds the live
 * controllers. A bounded concurrency queue avoids overloading the host. (Redis/BullMQ is not
 * used: see docs/adr/0003-in-process-queue.md.)
 */
const MAX_CONCURRENT = Number(process.env.FORGEAI_MAX_CONCURRENT_RUNS ?? 2);

type RunnerState = { active: Map<string, RunController>; queue: { runId: string; from: StartFrom }[]; recovered: boolean };
const g = globalThis as unknown as { __forgeaiRunner?: RunnerState };
const state: RunnerState = (g.__forgeaiRunner ??= { active: new Map(), queue: [], recovered: false });

function pump() {
  while (state.active.size < MAX_CONCURRENT && state.queue.length) {
    const { runId, from } = state.queue.shift()!;
    const c = new RunController(runId);
    state.active.set(runId, c);
    const job = from === "publishing" ? c.publish() : c.execute(from);
    job
      .catch((e) => logger.error({ runId, err: (e as Error).message }, "controller crashed"))
      .finally(() => {
        state.active.delete(runId);
        pump();
      });
  }
}

export function enqueue(runId: string, from: StartFrom = "preparing") {
  state.queue.push({ runId, from });
  pump();
}

export async function startRun(taskId: string) {
  await recoverOnce();
  const cfg = config();
  const span = tracer().startSpan("forgeai.run.create");
  const traceId = span.spanContext().traceId;
  span.end();
  const run = await store.createRun({ taskId, traceId, model: cfg.model, budget: cfg.budget });
  await emit(run.id, { type: "phase", agent: "controller", message: "Queued", data: { status: "queued", traceId } });
  notifyGlobal("run", { runId: run.id, status: "queued" });
  enqueue(run.id);
  return run;
}

export async function cancelRun(runId: string) {
  const live = state.active.get(runId);
  state.queue = state.queue.filter((q) => q.runId !== runId);
  if (live) {
    live.abort.abort();
    return true;
  }
  const run = await store.getRun(runId);
  if (!run || TERMINAL_STATUSES.includes(run.status)) return false;
  await store.updateRun(runId, { status: "cancelled", phase: "Cancelled", finished_at: new Date().toISOString(), active_agent: null, error: "Cancelled by operator" });
  await store.expireApprovals(runId);
  await emit(runId, { type: "phase", agent: "controller", message: "Cancelled", data: { status: "cancelled" } });
  if (run.workspace_path && run.workspace_path.startsWith(config().workspacesDir)) fs.rmSync(run.workspace_path, { recursive: true, force: true });
  notifyGlobal("run", { runId, status: "cancelled" });
  return true;
}

export async function decide(approvalId: string, userId: string, approved: boolean, comment?: string) {
  const ap = await store.decideApproval(approvalId, userId, approved, comment);
  if (!ap) throw new Error("Approval not found or already decided");
  await emit(ap.run_id, { type: "approval", agent: "controller", level: approved ? "info" : "warn", message: `${ap.kind === "plan" ? "Plan" : "Publish"} ${approved ? "approved" : "rejected"}${comment ? `: ${comment}` : ""}`, data: { approvalId, approved } });
  await store.audit({ userId, action: `approval.${approved ? "approved" : "rejected"}`, targetType: "approval", targetId: approvalId, details: { kind: ap.kind, runId: ap.run_id } });
  if (!approved) {
    await cancelRun(ap.run_id);
    return ap;
  }
  enqueue(ap.run_id, ap.kind === "plan" ? "coding" : "publishing");
  return ap;
}

export async function resumeRun(runId: string) {
  const run = await store.getRun(runId);
  if (!run) throw new Error("Run not found");
  if (run.status !== "interrupted") throw new Error(`Only interrupted runs can be resumed (status is ${run.status})`);
  await emit(runId, { type: "log", agent: "controller", message: run.plan ? "Resuming from plan checkpoint" : "Restarting from workspace preparation" });
  enqueue(runId, run.plan ? "coding" : "preparing");
}

export function isLive(runId: string) {
  return state.active.has(runId) || state.queue.some((q) => q.runId === runId);
}

/** On boot: runs that were mid-flight when the process died are marked interrupted. */
export async function recoverOnce() {
  if (state.recovered) return;
  state.recovered = true;
  const runs = await store.listNonTerminalRuns();
  for (const r of runs) {
    if (isLive(r.id) || r.status === "awaiting_plan_approval" || r.status === "awaiting_publish_approval" || r.status === "interrupted") continue;
    await store.updateRun(r.id, { status: "interrupted", phase: "Interrupted", active_agent: null });
    await emit(r.id, { type: "error", agent: "controller", level: "warn", message: `Run was interrupted while ${r.phase.toLowerCase()} (server restarted). It can be resumed.`, data: { previous: r.status } });
  }
}
