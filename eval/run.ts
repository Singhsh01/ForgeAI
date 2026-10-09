/**
 * ForgeAI agent benchmark. Runs the REAL workflow controller (planner → coder → sandbox
 * verification → repair → reviewer) on every task against a fresh copy of the fixture repo,
 * then grades the result with hidden tests executed in the sandbox.
 *
 *   npm run eval                 # all 20 tasks
 *   npm run eval -- auth-001     # selected tasks
 *
 * Requires a configured model provider (NVIDIA_API_KEY or GEMINI_API_KEY) and a working sandbox. Nothing is simulated: if the agents
 * cannot run, the script exits without writing a report.
 */
import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";

process.env.FORGEAI_DATA_DIR ??= path.join(process.cwd(), ".forgeai", "eval");

const { loadTasks, prepareRepo, installHidden, parseCounts, unrelatedFiles, writeReport } = await import("./common");
const { config, capabilities } = await import("../src/server/config");
const store = await import("../src/server/db/store");
const { RunController } = await import("../src/server/workflow/controller");
const { cancelRun } = await import("../src/server/workflow/runner");
const { runInSandbox, sandboxHealth } = await import("../src/server/sandbox");
const { tracer } = await import("../src/server/telemetry");
const { getDb } = await import("../src/server/db/client");

const cfg = config();
if (!capabilities().llm.ready) {
  console.error(`${cfg.llm.label} is not configured (API key missing). The benchmark runs the real agents and will not produce results without it.`);
  process.exit(2);
}
const health = await sandboxHealth();
if (!health.ok) {
  console.error(`Sandbox unavailable: ${health.detail}`);
  process.exit(2);
}

const tasks = loadTasks(process.argv.slice(2));
const suiteRunId = randomUUID();
const reposDir = path.join(cfg.dataDir, "repos", suiteRunId);
fs.mkdirSync(reposDir, { recursive: true });
const uid = await store.upsertUser("eval@forgeai.local", "eval", "operator");
const db = await getDb();
const results = [];

for (const t of tasks) {
  const started = Date.now();
  console.log(`\n▶ ${t.id} — ${t.title}`);
  const repoDir = prepareRepo(t, reposDir);
  const repo = await store.createRepo(uid, { kind: "local", full_name: `eval/${t.id}-${suiteRunId.slice(0, 6)}`, clone_url: repoDir, default_branch: "main", is_private: true, metadata: { eval: true } });
  const task = await store.createTask(uid, { repo_id: repo.id, title: t.title, description: `${t.prompt}\n\nAcceptance criteria:\n${t.acceptance.map((a) => `- ${a}`).join("\n")}`, source: "eval", issue_number: null, issue_url: null, require_plan_approval: false });
  const span = tracer().startSpan("forgeai.eval.task");
  const run = await store.createRun({ taskId: task.id, traceId: span.spanContext().traceId, model: cfg.model, budget: cfg.budget });
  span.end();
  await new RunController(run.id).execute();
  const done = (await store.getRun(run.id))!;

  let hiddenPassed = 0;
  let hiddenTotal = 0;
  let completed = false;
  let status: string = done.status;
  let error = done.error ?? undefined;
  if (done.status === "awaiting_publish_approval" && done.workspace_path) {
    const cmd = installHidden(t, done.workspace_path);
    const graded = await runInSandbox({ workspace: done.workspace_path, command: cmd, network: false, timeoutMs: 180_000 });
    const c = parseCounts(graded.output);
    hiddenPassed = c.passed;
    hiddenTotal = c.total;
    completed = graded.exitCode === 0 && c.total > 0;
    status = completed ? "solved" : "hidden tests failed";
    if (!completed) error = graded.output.slice(-1500);
    await cancelRun(run.id); // never publish eval branches; also removes the workspace
  }
  const changed = (done.diff_snapshot ?? []).map((d) => d.path);
  const unrelated = unrelatedFiles(t, changed);
  const calls = await store.listToolCalls(run.id);
  const result = {
    task: t.id, category: t.category, runId: run.id, status, completed, hiddenPassed, hiddenTotal, unrelatedFiles: unrelated,
    repairIterations: done.repair_attempts, toolFailures: calls.filter((c) => c.decision === "denied").length,
    durationMs: Date.now() - started, tokens: done.input_tokens + done.output_tokens, costUsd: done.cost_usd, error,
  };
  results.push(result);
  await db.query(
    `INSERT INTO evaluation_results (id, suite_run_id, task_key, category, run_id, completed, hidden_tests_passed, hidden_tests_total, unrelated_files, repair_iterations, tool_failures, duration_ms, tokens, cost_usd, details)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)`,
    [randomUUID(), suiteRunId, t.id, t.category, run.id, completed, hiddenPassed, hiddenTotal, unrelated.length, result.repairIterations, result.toolFailures, result.durationMs, result.tokens, result.costUsd, JSON.stringify({ status, error })],
  );
  console.log(`  ${completed ? "✓ solved" : `✗ ${status}`} — hidden ${hiddenPassed}/${hiddenTotal}, ${unrelated.length} unrelated files, ${result.repairIterations} repairs, $${result.costUsd.toFixed(4)}`);
}

const solved = results.filter((r) => r.completed).length;
const file = writeReport(
  {
    kind: "agent-run",
    suiteRunId,
    createdAt: new Date().toISOString(),
    model: cfg.model,
    summary: {
      Tasks: results.length,
      Solved: solved,
      "Completion rate": `${Math.round((solved / Math.max(1, results.length)) * 100)}%`,
      "Hidden tests passed": `${results.reduce((s, r) => s + r.hiddenPassed, 0)}/${results.reduce((s, r) => s + r.hiddenTotal, 0)}`,
      "Unrelated file edits": results.reduce((s, r) => s + r.unrelatedFiles.length, 0),
      "Repair iterations": results.reduce((s, r) => s + r.repairIterations, 0),
      "Total cost": `$${results.reduce((s, r) => s + r.costUsd, 0).toFixed(2)}`,
      "Avg time": `${Math.round(results.reduce((s, r) => s + r.durationMs, 0) / Math.max(1, results.length) / 1000)}s`,
    },
    results,
  },
  "agent-run",
);
console.log(`\n${solved}/${results.length} solved. Report: ${path.relative(process.cwd(), file)}`);
process.exit(0);
