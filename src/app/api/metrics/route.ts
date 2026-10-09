import { route } from "@/server/http";
import * as store from "@/server/db/store";

export const dynamic = "force-dynamic";
export const GET = route(async (_req, { session }) => {
  const [m, runs, pending] = await Promise.all([store.metrics(session.uid), store.listRuns(session.uid, 50), store.listPendingApprovals(session.uid)]);
  return {
    metrics: m,
    pending,
    runs: runs.map((r) => ({
      id: r.id, task_title: r.task_title, repo_name: r.repo_name, status: r.status, phase: r.phase, trace_id: r.trace_id, model: r.model,
      input_tokens: r.input_tokens, output_tokens: r.output_tokens, cost_usd: r.cost_usd, steps: r.steps, repair_attempts: r.repair_attempts,
      tool_call_count: r.tool_call_count, denied_tool_calls: r.denied_tool_calls, started_at: r.started_at, finished_at: r.finished_at,
      duration_ms: r.finished_at ? new Date(r.finished_at).getTime() - new Date(r.started_at).getTime() : null, context_strategy: r.context_strategy,
    })),
  };
});
