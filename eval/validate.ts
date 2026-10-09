/**
 * Validates the evaluation suite itself (no model calls):
 *  1. the fixture's own test suite passes,
 *  2. every hidden test FAILS on the untouched fixture (the task is real),
 *  3. every hidden test PASSES with the reference solution (the task is solvable),
 *  4. the reference solution keeps the fixture suite green and touches only allowed paths.
 * Writes a machine-readable report to eval/reports/.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { applyReference, installHidden, loadTasks, parseCounts, prepareRepo, removeHidden, runHost, unrelatedFiles, writeReport } from "./common";
import { execFileSync } from "node:child_process";

const tasks = loadTasks(process.argv.slice(2));
const parent = fs.mkdtempSync(path.join(os.tmpdir(), "forgeai-validate-"));
const results = [];
let ok = 0;

for (const t of tasks) {
  const started = Date.now();
  const base = prepareRepo(t, parent);
  const suiteBaseline = runHost("npm test --silent", base);
  const cmd = installHidden(t, base);
  const before = runHost(cmd, base);
  removeHidden(base);

  applyReference(t, base);
  const suiteAfter = runHost("npm test --silent", base);
  installHidden(t, base);
  const after = runHost(cmd, base);
  const counts = parseCounts(after.output);
  removeHidden(base);
  execFileSync("git", ["add", "-A"], { cwd: base });
  const changed = execFileSync("git", ["diff", "--cached", "--name-only", "HEAD"], { cwd: base, encoding: "utf8" }).split("\n").filter(Boolean);
  const unrelated = unrelatedFiles(t, changed);

  const problems: string[] = [];
  if (!suiteBaseline.ok) problems.push("fixture suite fails before changes");
  if (before.ok) problems.push("hidden test already passes on the untouched fixture");
  if (!after.ok) problems.push("hidden test fails on the reference solution");
  if (!suiteAfter.ok) problems.push("fixture suite fails with the reference solution");
  if (unrelated.length) problems.push(`reference touches unrelated files: ${unrelated.join(", ")}`);
  const valid = problems.length === 0;
  if (valid) ok++;
  results.push({
    task: t.id, category: t.category, status: valid ? "valid" : "invalid", completed: valid,
    hiddenPassed: counts.passed, hiddenTotal: counts.total, unrelatedFiles: unrelated, repairIterations: 0, toolFailures: 0,
    durationMs: Date.now() - started, tokens: 0, costUsd: 0, error: problems.join("; ") || undefined,
    baselineFailedAsExpected: !before.ok,
    ...(valid ? {} : { output: (after.ok ? before.output : after.output).slice(-3000) }),
  });
  console.log(`${valid ? "✓" : "✗"} ${t.id.padEnd(14)} ${valid ? `hidden ${counts.passed}/${counts.total} with reference, fails on baseline` : problems.join("; ")}`);
}

const file = writeReport(
  {
    kind: "baseline-validation",
    suiteRunId: randomUUID(),
    createdAt: new Date().toISOString(),
    summary: { Tasks: tasks.length, Valid: ok, Invalid: tasks.length - ok, "Hidden tests": results.reduce((s, r) => s + r.hiddenTotal, 0) },
    results,
  },
  "validation",
);
fs.rmSync(parent, { recursive: true, force: true });
console.log(`\n${ok}/${tasks.length} tasks valid. Report: ${path.relative(process.cwd(), file)}`);
process.exit(ok === tasks.length ? 0 : 1);
