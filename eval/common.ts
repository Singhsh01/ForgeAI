import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync, spawnSync } from "node:child_process";
import { z } from "zod";

export const EVAL_DIR = path.dirname(new URL(import.meta.url).pathname);
export const FIXTURE = path.join(EVAL_DIR, "fixtures", "toolkit");

export const TaskSchema = z.object({
  id: z.string(),
  category: z.enum(["bugfix", "feature", "refactor", "testgen", "dependency"]),
  title: z.string(),
  prompt: z.string(),
  acceptance: z.array(z.string()).min(1),
  allowedPaths: z.array(z.string()),
  hiddenTest: z.string(),
  reference: z.string(),
  setup: z.record(z.string(), z.string()).optional(),
});
export type EvalTask = z.infer<typeof TaskSchema>;

export function loadTasks(filter?: string[]): EvalTask[] {
  const dir = path.join(EVAL_DIR, "tasks");
  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith(".json"))
    .sort()
    .map((f) => TaskSchema.parse(JSON.parse(fs.readFileSync(path.join(dir, f), "utf8"))))
    .filter((t) => !filter?.length || filter.includes(t.id));
}

/** Creates a fresh git repository from the fixture with the task's setup applied. */
export function prepareRepo(task: EvalTask, parent = fs.mkdtempSync(path.join(os.tmpdir(), "forgeai-eval-"))) {
  const dir = path.join(parent, task.id);
  fs.cpSync(FIXTURE, dir, { recursive: true });
  for (const [dest, src] of Object.entries(task.setup ?? {})) fs.copyFileSync(path.join(EVAL_DIR, src), path.join(dir, dest));
  const g = (...a: string[]) => execFileSync("git", ["-c", "core.hooksPath=/dev/null", ...a], { cwd: dir, stdio: "pipe" });
  g("init", "-q", "-b", "main");
  g("config", "user.email", "eval@forgeai.local");
  g("config", "user.name", "ForgeAI Eval");
  g("add", "-A");
  g("commit", "-q", "-m", `fixture for ${task.id}`);
  return dir;
}

export function applyReference(task: EvalTask, dir: string) {
  const ref = path.join(EVAL_DIR, task.reference);
  fs.cpSync(ref, dir, { recursive: true });
}

export function installHidden(task: EvalTask, dir: string) {
  const dest = path.join(dir, "test", "hidden");
  fs.mkdirSync(dest, { recursive: true });
  fs.copyFileSync(path.join(EVAL_DIR, task.hiddenTest), path.join(dest, path.basename(task.hiddenTest)));
  fs.copyFileSync(path.join(EVAL_DIR, "hidden", "_mutation.js"), path.join(dest, "_mutation.js"));
  return `node --test test/hidden/${path.basename(task.hiddenTest)}`;
}

export function removeHidden(dir: string) {
  fs.rmSync(path.join(dir, "test", "hidden"), { recursive: true, force: true });
}

export function parseCounts(out: string) {
  const pass = Number(out.match(/^# pass (\d+)/m)?.[1] ?? 0);
  const fail = Number(out.match(/^# fail (\d+)/m)?.[1] ?? 0);
  return { passed: pass, total: pass + fail };
}

/** Runs a trusted command on the host (used only for reference solutions we wrote). */
export function runHost(cmd: string, cwd: string) {
  const r = spawnSync("sh", ["-c", cmd], { cwd, encoding: "utf8", timeout: 120_000, env: { PATH: process.env.PATH, HOME: os.tmpdir(), NO_COLOR: "1" } as unknown as NodeJS.ProcessEnv });
  return { ok: r.status === 0, output: (r.stdout ?? "") + (r.stderr ?? "") };
}

/** Files changed relative to the initial commit that fall outside the task's allowed paths. */
export function unrelatedFiles(task: EvalTask, changed: string[]) {
  return changed.filter((f) => !f.startsWith("test/hidden/") && !task.allowedPaths.some((a) => (a.endsWith("/") ? f.startsWith(a) : f === a)));
}

export function writeReport(report: unknown, prefix: string) {
  const dir = path.join(EVAL_DIR, "reports");
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `${new Date().toISOString().replace(/[:.]/g, "-")}-${prefix}.json`);
  fs.writeFileSync(file, JSON.stringify(report, null, 2));
  return file;
}
