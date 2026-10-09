import { getDb, type Db } from "./client";
import { newId } from "../ids";
import { redact, redactDeep } from "../redact";
import type {
  AgentName, AgentRun, ApprovalRequest, ExecutionEvent, RepoConnection, RunStatus, Task, TestResult, ToolCall,
} from "@/lib/types";

/** Data-access layer. All SQL lives here; callers get typed, normalised rows. */

let dbOverride: Db | undefined;
export function useDb(db: Db | undefined) {
  dbOverride = db;
}
const db = async () => dbOverride ?? (await getDb());

const num = (v: unknown) => (v == null ? 0 : Number(v));
const iso = (v: unknown) => (v instanceof Date ? v.toISOString() : (v as string));

function normRun(r: Record<string, unknown>): AgentRun {
  return {
    ...(r as unknown as AgentRun),
    input_tokens: num(r.input_tokens),
    output_tokens: num(r.output_tokens),
    cache_read_tokens: num(r.cache_read_tokens),
    cost_usd: num(r.cost_usd),
    started_at: iso(r.started_at),
    finished_at: r.finished_at ? iso(r.finished_at) : null,
    updated_at: iso(r.updated_at),
  };
}
const normDates = <T,>(r: Record<string, unknown>): T => {
  const out: Record<string, unknown> = { ...r };
  for (const k of Object.keys(out)) if (out[k] instanceof Date) out[k] = (out[k] as Date).toISOString();
  return out as T;
};

// ── users ────────────────────────────────────────────────────────────────
export async function upsertUser(email: string, displayName: string, role = "admin") {
  const d = await db();
  const existing = await d.query<{ id: string }>("SELECT id FROM users WHERE email = $1", [email]);
  if (existing[0]) return existing[0].id;
  const id = newId("usr");
  await d.query("INSERT INTO users (id, email, display_name, role) VALUES ($1,$2,$3,$4)", [id, email, displayName, role]);
  return id;
}

// ── repositories ─────────────────────────────────────────────────────────
export async function createRepo(userId: string, r: Omit<RepoConnection, "id" | "created_at">) {
  const d = await db();
  const id = newId("repo");
  const rows = await d.query(
    `INSERT INTO repo_connections (id, user_id, kind, full_name, clone_url, default_branch, is_private, metadata)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
     ON CONFLICT (user_id, kind, full_name) DO UPDATE SET default_branch = EXCLUDED.default_branch, metadata = EXCLUDED.metadata
     RETURNING *`,
    [id, userId, r.kind, r.full_name, r.clone_url, r.default_branch, r.is_private, JSON.stringify(r.metadata ?? {})],
  );
  return normDates<RepoConnection>(rows[0]);
}
export async function listRepos(userId: string) {
  const rows = await (await db()).query(
    `SELECT r.*,
       (SELECT count(*) FROM tasks t WHERE t.repo_id = r.id)::int AS task_count,
       (SELECT count(*) FROM tasks t JOIN agent_runs a ON a.task_id = t.id WHERE t.repo_id = r.id
          AND a.status NOT IN ('completed','failed','cancelled'))::int AS active_runs
     FROM repo_connections r WHERE r.user_id = $1 ORDER BY r.created_at DESC`,
    [userId],
  );
  return rows.map((r) => normDates<RepoConnection & { task_count: number; active_runs: number }>(r));
}
export async function getRepo(id: string) {
  const rows = await (await db()).query("SELECT * FROM repo_connections WHERE id = $1", [id]);
  return rows[0] ? normDates<RepoConnection & { user_id: string }>(rows[0]) : null;
}
export async function deleteRepo(id: string, userId: string) {
  await (await db()).query("DELETE FROM repo_connections WHERE id = $1 AND user_id = $2", [id, userId]);
}

// ── tasks ────────────────────────────────────────────────────────────────
export async function createTask(userId: string, t: Omit<Task, "id" | "created_at">) {
  const id = newId("task");
  const rows = await (await db()).query(
    `INSERT INTO tasks (id, repo_id, user_id, title, description, source, issue_number, issue_url, require_plan_approval)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
    [id, t.repo_id, userId, t.title, t.description, t.source, t.issue_number, t.issue_url, t.require_plan_approval],
  );
  return normDates<Task>(rows[0]);
}
export async function getTask(id: string) {
  const rows = await (await db()).query("SELECT * FROM tasks WHERE id = $1", [id]);
  return rows[0] ? normDates<Task & { user_id: string }>(rows[0]) : null;
}
export async function listTasks(userId: string, repoId?: string) {
  const rows = await (await db()).query(
    `SELECT t.*, r.full_name AS repo_name, r.kind AS repo_kind,
       lr.id AS run_id, lr.status AS run_status, lr.phase AS run_phase, lr.branch AS run_branch,
       lr.cost_usd AS run_cost, lr.pr_url AS run_pr_url, lr.started_at AS run_started_at
     FROM tasks t
     JOIN repo_connections r ON r.id = t.repo_id
     LEFT JOIN LATERAL (SELECT * FROM agent_runs a WHERE a.task_id = t.id ORDER BY a.started_at DESC LIMIT 1) lr ON true
     WHERE t.user_id = $1 AND ($2::text IS NULL OR t.repo_id = $2)
     ORDER BY t.created_at DESC LIMIT 200`,
    [userId, repoId ?? null],
  );
  return rows.map((r) => {
    const o = normDates<Record<string, unknown>>(r);
    o.run_cost = num(o.run_cost);
    return o as unknown as Task & {
      repo_name: string; repo_kind: string; run_id: string | null; run_status: RunStatus | null; run_phase: string | null;
      run_branch: string | null; run_cost: number; run_pr_url: string | null; run_started_at: string | null;
    };
  });
}

// ── runs ─────────────────────────────────────────────────────────────────
export async function createRun(r: { taskId: string; traceId: string; model: string; budget: AgentRun["budget"] }) {
  const id = newId("run");
  const rows = await (await db()).query(
    `INSERT INTO agent_runs (id, task_id, status, phase, trace_id, model, budget) VALUES ($1,$2,'queued','queued',$3,$4,$5) RETURNING *`,
    [id, r.taskId, r.traceId, r.model, JSON.stringify(r.budget)],
  );
  return normRun(rows[0]);
}
export async function getRun(id: string) {
  const rows = await (await db()).query("SELECT * FROM agent_runs WHERE id = $1", [id]);
  return rows[0] ? normRun(rows[0]) : null;
}
const RUN_JSON_COLS = new Set(["plan", "review", "diff_stats", "budget", "diff_snapshot", "project"]);
export async function updateRun(id: string, patch: Partial<Omit<AgentRun, "id">>) {
  const keys = Object.keys(patch) as (keyof typeof patch)[];
  if (!keys.length) return;
  const sets = keys.map((k, i) => `${String(k)} = $${i + 2}`);
  const vals = keys.map((k) => (RUN_JSON_COLS.has(String(k)) && patch[k] != null ? JSON.stringify(patch[k]) : patch[k]));
  await (await db()).query(`UPDATE agent_runs SET ${sets.join(", ")}, updated_at = now() WHERE id = $1`, [id, ...vals]);
}
export async function addRunUsage(id: string, u: { input: number; output: number; cacheRead: number; cost: number; steps?: number }) {
  await (await db()).query(
    `UPDATE agent_runs SET input_tokens = input_tokens + $2, output_tokens = output_tokens + $3,
       cache_read_tokens = cache_read_tokens + $4, cost_usd = cost_usd + $5, steps = steps + $6, updated_at = now() WHERE id = $1`,
    [id, u.input, u.output, u.cacheRead, u.cost, u.steps ?? 0],
  );
}
export async function incrementSteps(id: string, by = 1) {
  const rows = await (await db()).query<{ steps: number }>("UPDATE agent_runs SET steps = steps + $2 WHERE id = $1 RETURNING steps", [id, by]);
  return rows[0]?.steps ?? 0;
}
export async function listRuns(userId: string, limit = 100) {
  const rows = await (await db()).query(
    `SELECT a.*, t.title AS task_title, r.full_name AS repo_name,
       (SELECT count(*) FROM tool_calls c WHERE c.run_id = a.id)::int AS tool_call_count,
       (SELECT count(*) FROM tool_calls c WHERE c.run_id = a.id AND c.decision = 'denied')::int AS denied_tool_calls
     FROM agent_runs a JOIN tasks t ON t.id = a.task_id JOIN repo_connections r ON r.id = t.repo_id
     WHERE t.user_id = $1 ORDER BY a.started_at DESC LIMIT $2`,
    [userId, limit],
  );
  return rows.map((r) => ({ ...normRun(r), diff_snapshot: null, task_title: r.task_title as string, repo_name: r.repo_name as string, tool_call_count: num(r.tool_call_count), denied_tool_calls: num(r.denied_tool_calls) }));
}
export async function listNonTerminalRuns() {
  const rows = await (await db()).query(`SELECT * FROM agent_runs WHERE status NOT IN ('completed','failed','cancelled')`);
  return rows.map(normRun);
}
export async function runOwner(runId: string) {
  const rows = await (await db()).query<{ user_id: string }>(
    "SELECT t.user_id FROM agent_runs a JOIN tasks t ON t.id = a.task_id WHERE a.id = $1",
    [runId],
  );
  return rows[0]?.user_id ?? null;
}

// ── events ───────────────────────────────────────────────────────────────
export async function appendEvent(e: { runId: string; type: ExecutionEvent["type"]; agent?: AgentName | null; level?: ExecutionEvent["level"]; message: string; data?: Record<string, unknown> | null }) {
  const d = await db();
  const rows = await d.query(
    `INSERT INTO execution_events (run_id, seq, type, agent, level, message, data)
     VALUES ($1, COALESCE((SELECT max(seq) FROM execution_events WHERE run_id = $1), 0) + 1, $2, $3, $4, $5, $6)
     RETURNING *`,
    [e.runId, e.type, e.agent ?? null, e.level ?? "info", redact(e.message).slice(0, 8000), e.data ? JSON.stringify(redactDeep(e.data)) : null],
  );
  return normDates<ExecutionEvent>(rows[0]);
}
export async function listEvents(runId: string, afterSeq = 0) {
  const rows = await (await db()).query("SELECT * FROM execution_events WHERE run_id = $1 AND seq > $2 ORDER BY seq ASC LIMIT 2000", [runId, afterSeq]);
  return rows.map((r) => normDates<ExecutionEvent>(r));
}

// ── tool calls ───────────────────────────────────────────────────────────
export async function recordToolCall(t: { runId: string; agent: AgentName; toolName: string; input: unknown; decision: "allowed" | "denied"; denyReason?: string }) {
  const id = newId("tc");
  await (await db()).query(
    "INSERT INTO tool_calls (id, run_id, agent, tool_name, input, decision, deny_reason) VALUES ($1,$2,$3,$4,$5,$6,$7)",
    [id, t.runId, t.agent, t.toolName, JSON.stringify(redactDeep(truncateInput(t.input))), t.decision, t.denyReason ?? null],
  );
  return id;
}
function truncateInput(input: unknown): unknown {
  if (input == null || typeof input !== "object") return input;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(input as Record<string, unknown>)) out[k] = typeof v === "string" && v.length > 2000 ? v.slice(0, 2000) + "…[truncated]" : v;
  return out;
}
export async function listToolCalls(runId: string) {
  const rows = await (await db()).query("SELECT * FROM tool_calls WHERE run_id = $1 ORDER BY created_at ASC", [runId]);
  return rows.map((r) => normDates<ToolCall>(r));
}

// ── test results ─────────────────────────────────────────────────────────
export async function recordTestResult(t: Omit<TestResult, "id" | "created_at">) {
  const id = newId("tr");
  await (await db()).query(
    `INSERT INTO test_results (id, run_id, attempt, kind, command, sandbox, exit_code, passed, timed_out, duration_ms, summary, output_tail)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
    [id, t.run_id, t.attempt, t.kind, t.command, t.sandbox, t.exit_code, t.passed, t.timed_out, t.duration_ms, t.summary ? JSON.stringify(t.summary) : null, t.output_tail ? redact(t.output_tail) : null],
  );
  return id;
}
export async function listTestResults(runId: string) {
  const rows = await (await db()).query("SELECT * FROM test_results WHERE run_id = $1 ORDER BY created_at ASC", [runId]);
  return rows.map((r) => normDates<TestResult>(r));
}

// ── approvals ────────────────────────────────────────────────────────────
export async function createApproval(a: { runId: string; kind: ApprovalRequest["kind"]; summary: string; payload?: Record<string, unknown> }) {
  const id = newId("apr");
  const rows = await (await db()).query(
    "INSERT INTO approval_requests (id, run_id, kind, summary, payload) VALUES ($1,$2,$3,$4,$5) RETURNING *",
    [id, a.runId, a.kind, a.summary, a.payload ? JSON.stringify(a.payload) : null],
  );
  return normDates<ApprovalRequest>(rows[0]);
}
export async function getApproval(id: string) {
  const rows = await (await db()).query("SELECT * FROM approval_requests WHERE id = $1", [id]);
  return rows[0] ? normDates<ApprovalRequest>(rows[0]) : null;
}
export async function listApprovals(runId: string) {
  const rows = await (await db()).query("SELECT * FROM approval_requests WHERE run_id = $1 ORDER BY created_at ASC", [runId]);
  return rows.map((r) => normDates<ApprovalRequest>(r));
}
export async function listPendingApprovals(userId: string) {
  const rows = await (await db()).query(
    `SELECT ap.*, t.title AS task_title FROM approval_requests ap JOIN agent_runs a ON a.id = ap.run_id JOIN tasks t ON t.id = a.task_id
     WHERE ap.status = 'pending' AND t.user_id = $1 ORDER BY ap.created_at DESC`,
    [userId],
  );
  return rows.map((r) => normDates<ApprovalRequest & { task_title: string }>(r));
}
export async function decideApproval(id: string, userId: string, approved: boolean, comment?: string) {
  const rows = await (await db()).query(
    `UPDATE approval_requests SET status = $2, decided_by = $3, decided_at = now(), comment = $4
     WHERE id = $1 AND status = 'pending' RETURNING *`,
    [id, approved ? "approved" : "rejected", userId, comment ?? null],
  );
  return rows[0] ? normDates<ApprovalRequest>(rows[0]) : null;
}
export async function expireApprovals(runId: string) {
  await (await db()).query("UPDATE approval_requests SET status = 'expired' WHERE run_id = $1 AND status = 'pending'", [runId]);
}

// ── audit ────────────────────────────────────────────────────────────────
export async function audit(a: { userId?: string | null; action: string; targetType?: string; targetId?: string; ip?: string | null; details?: Record<string, unknown> }) {
  await (await db()).query(
    "INSERT INTO audit_events (user_id, action, target_type, target_id, ip, details) VALUES ($1,$2,$3,$4,$5,$6)",
    [a.userId ?? null, a.action, a.targetType ?? null, a.targetId ?? null, a.ip ?? null, a.details ? JSON.stringify(redactDeep(a.details)) : null],
  );
}
export async function listAudit(limit = 100) {
  const rows = await (await db()).query("SELECT * FROM audit_events ORDER BY created_at DESC LIMIT $1", [limit]);
  return rows.map((r) => normDates<Record<string, unknown>>(r));
}

// ── observability aggregates ─────────────────────────────────────────────
export async function metrics(userId: string) {
  const d = await db();
  const [totals] = await d.query(
    `SELECT count(*)::int AS runs,
       count(*) FILTER (WHERE a.status = 'completed')::int AS completed,
       count(*) FILTER (WHERE a.status = 'failed')::int AS failed,
       count(*) FILTER (WHERE a.status = 'cancelled')::int AS cancelled,
       count(*) FILTER (WHERE a.status NOT IN ('completed','failed','cancelled'))::int AS active,
       COALESCE(sum(a.input_tokens),0)::bigint AS input_tokens,
       COALESCE(sum(a.output_tokens),0)::bigint AS output_tokens,
       COALESCE(sum(a.cost_usd),0) AS cost_usd,
       COALESCE(avg(EXTRACT(EPOCH FROM (a.finished_at - a.started_at)) * 1000) FILTER (WHERE a.finished_at IS NOT NULL), 0) AS avg_duration_ms
     FROM agent_runs a JOIN tasks t ON t.id = a.task_id WHERE t.user_id = $1`,
    [userId],
  );
  const tools = await d.query(
    `SELECT c.tool_name, c.decision, count(*)::int AS n FROM tool_calls c JOIN agent_runs a ON a.id = c.run_id JOIN tasks t ON t.id = a.task_id
     WHERE t.user_id = $1 GROUP BY c.tool_name, c.decision ORDER BY n DESC`,
    [userId],
  );
  return {
    runs: num(totals.runs), completed: num(totals.completed), failed: num(totals.failed), cancelled: num(totals.cancelled), active: num(totals.active),
    inputTokens: num(totals.input_tokens), outputTokens: num(totals.output_tokens), costUsd: num(totals.cost_usd), avgDurationMs: num(totals.avg_duration_ms),
    tools: tools.map((t) => ({ tool: t.tool_name as string, decision: t.decision as string, count: num(t.n) })),
  };
}
