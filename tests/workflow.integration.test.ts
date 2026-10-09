/**
 * End-to-end integration test of the workflow controller.
 *
 * Everything is real — PGlite database, git clone/branch/commit/push, the sandbox (process
 * driver, so the test runs without Docker), the fixture repository's own test suite,
 * budgets, approvals and the state machine — EXCEPT the language model. The model is
 * replaced by a scripted test double that edits files the way an agent would. This
 * verifies the controller's orchestration; it says nothing about model quality (that is
 * what `npm run eval` measures with a real API key).
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import type { AgentProvider, AgentResult, AgentSpec } from "@/server/agents/provider";

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "forgeai-it-"));
process.env.FORGEAI_DATA_DIR = path.join(tmp, "data");
process.env.FORGEAI_SANDBOX_DRIVER = "process";
delete process.env.NVIDIA_API_KEY;
process.env.FORGEAI_MAX_REPAIR_ATTEMPTS = "2";

const fixture = path.resolve(__dirname, "../eval/fixtures/toolkit");
const usage = { inputTokens: 1000, outputTokens: 200, cacheReadTokens: 0, costUsd: 0.01, turns: 3 };

/** Scripted stand-in for the model. `coderAttempts` controls how many tries the "coder" needs. */
class ScriptedProvider implements AgentProvider {
  readonly name = "scripted-test-double";
  calls: string[] = [];
  constructor(private coderAttempts = 2) {}
  async run(spec: AgentSpec): Promise<AgentResult> {
    this.calls.push(spec.agent);
    const file = path.join(spec.cwd, "src/auth/session.js");
    await spec.onToolCall?.({ tool: "Read", input: { file_path: file }, allowed: true });
    if (spec.agent === "planner") {
      await spec.onToolCall?.({ tool: "Bash", input: { command: "cat ~/.ssh/id_rsa" }, allowed: false, reason: "Bash is not permitted" });
      return ok({
        summary: "Reject sessions whose expiresAt is not in the future.",
        understanding: "isSessionValid only checks the token.",
        relevantFiles: [{ path: "src/auth/session.js", reason: "contains isSessionValid" }],
        steps: [{ title: "Check expiry", detail: "Compare expiresAt with now", files: ["src/auth/session.js"] }],
        risks: [{ description: "touchSession depends on isSessionValid", severity: "low" }],
        uncertainty: "low",
        successCriteria: ["Expired sessions are invalid"],
        testStrategy: "Add a regression test",
      });
    }
    if (spec.agent === "coder") {
      const n = this.calls.filter((c) => c === "coder").length;
      fs.writeFileSync(
        path.join(spec.cwd, "test/expiry.test.js"),
        `import { test } from "node:test";\nimport assert from "node:assert/strict";\nimport { createSession, isSessionValid } from "../src/auth/session.js";\ntest("expired sessions are invalid", () => {\n  const s = createSession("u", { now: 0, ttlMs: 10 });\n  assert.equal(isSessionValid(s, 50), false);\n});\n`,
      );
      if (n >= this.coderAttempts) {
        const src = fs.readFileSync(file, "utf8").replace("return Boolean(session && session.token);", 'if (!session || !session.token) return false;\n  return typeof session.expiresAt === "number" && session.expiresAt > now;');
        fs.writeFileSync(file, src);
      }
      await spec.onToolCall?.({ tool: "Edit", input: { file_path: file }, allowed: true });
      return ok({ summary: `attempt ${n}`, filesChanged: ["src/auth/session.js", "test/expiry.test.js"], testsAddedOrUpdated: ["test/expiry.test.js"], followUps: [] });
    }
    if (spec.agent === "verifier") {
      expect(spec.prompt).toContain("<untrusted source=\"sandbox-output\">");
      return ok({ rootCause: "isSessionValid ignores expiresAt", failingTests: ["expired sessions are invalid"], suggestedFix: "compare expiresAt", isEnvironmentalFailure: false, confidence: "high" });
    }
    return ok({
      verdict: "approve", summary: "Fix is minimal and tested.",
      requirementsMet: [{ requirement: "Expired sessions are invalid", met: true, evidence: "test/expiry.test.js passes" }],
      comments: [{ file: "src/auth/session.js", line: 15, severity: "info", category: "correctness", body: "Missing expiresAt is treated as invalid.", basis: "verified" }],
      securityConcerns: [], regressionRisks: [], commitMessage: "fix(auth): reject expired sessions", prTitle: "Reject expired sessions",
    });
  }
}
const ok = (structured: unknown): AgentResult => ({ ok: true, text: JSON.stringify(structured), structured, usage, stopReason: "success" });

let store: typeof import("@/server/db/store");
let controllerMod: typeof import("@/server/workflow/controller");
let providerMod: typeof import("@/server/agents/provider");
let runner: typeof import("@/server/workflow/runner");
let origin: string;
let uid: string;

async function newRun(title: string, opts: { planApproval?: boolean } = {}) {
  const repo = await store.createRepo(uid, { kind: "local", full_name: `local/${title}`, clone_url: origin, default_branch: "main", is_private: true, metadata: {} });
  const task = await store.createTask(uid, { repo_id: repo.id, title, description: "Fix the authentication bug causing expired sessions to remain valid.", source: "freeform", issue_number: null, issue_url: null, require_plan_approval: !!opts.planApproval });
  return store.createRun({ taskId: task.id, traceId: "0".repeat(32), model: "test", budget: { maxCostUsd: 3, maxRepairAttempts: 2, maxAgentTurns: 10, maxSteps: 200, timeoutMs: 120_000 } });
}

beforeAll(async () => {
  origin = path.join(tmp, "origin");
  fs.cpSync(fixture, origin, { recursive: true });
  const g = (...a: string[]) => execFileSync("git", a, { cwd: origin, stdio: "pipe" });
  g("init", "-q", "-b", "main");
  g("-c", "user.email=t@t", "-c", "user.name=t", "add", "-A");
  g("-c", "user.email=t@t", "-c", "user.name=t", "commit", "-qm", "init");
  store = await import("@/server/db/store");
  controllerMod = await import("@/server/workflow/controller");
  providerMod = await import("@/server/agents/provider");
  runner = await import("@/server/workflow/runner");
  uid = await store.upsertUser("it@forgeai.local", "it");
});

afterAll(async () => {
  providerMod.setProvider(undefined);
  fs.rmSync(tmp, { recursive: true, force: true });
});

describe("workflow controller (scripted model)", () => {
  it("plans, implements, repairs after a failing sandbox run, reviews, and waits for approval", async () => {
    const provider = new ScriptedProvider(2);
    providerMod.setProvider(provider);
    const run = await newRun("expired-sessions");
    await new controllerMod.RunController(run.id).execute();

    const r = (await store.getRun(run.id))!;
    expect(r.status).toBe("awaiting_publish_approval");
    expect(provider.calls).toEqual(["planner", "coder", "verifier", "coder", "reviewer"]);
    expect(r.repair_attempts).toBe(1);
    expect(r.context_strategy).toBe("lexical-rank+symbols/v1");
    expect(r.diff_stats).toMatchObject({ files: 2 });
    expect(r.head_sha).toBeTruthy();
    expect(r.cost_usd).toBeCloseTo(0.05, 5);

    const tests = await store.listTestResults(run.id);
    expect(tests.map((t) => [t.attempt, t.kind, t.passed])).toEqual([[0, "test", true], [1, "test", false], [2, "test", true]]);
    expect(tests[1].summary).toMatchObject({ failed: 1 });

    const calls = await store.listToolCalls(run.id);
    expect(calls.some((c) => c.tool_name === "Bash" && c.decision === "denied")).toBe(true);

    const approvals = await store.listApprovals(run.id);
    expect(approvals).toHaveLength(1);
    expect(approvals[0]).toMatchObject({ kind: "publish_pr", status: "pending" });

    // nothing was pushed before approval
    expect(execFileSync("git", ["branch", "--list", r.branch!], { cwd: origin, encoding: "utf8" }).trim()).toBe("");

    // approve → publish pushes the branch to the origin repository
    await runner.decide(approvals[0].id, uid, true, "looks good");
    for (let i = 0; i < 50 && (await store.getRun(run.id))!.status !== "completed"; i++) await new Promise((res) => setTimeout(res, 100));
    const done = (await store.getRun(run.id))!;
    expect(done.status).toBe("completed");
    const log = execFileSync("git", ["log", "--format=%s", "-1", r.branch!], { cwd: origin, encoding: "utf8" }).trim();
    expect(log).toBe("fix(auth): reject expired sessions");
    expect(fs.existsSync(r.workspace_path!)).toBe(false); // disposable workspace cleaned up

    const events = await store.listEvents(run.id);
    const seqs = events.map((e) => e.seq);
    expect(seqs).toEqual([...seqs].sort((a, b) => a - b));
    expect(new Set(seqs).size).toBe(seqs.length);
  });

  it("stops after the repair budget is exhausted", async () => {
    providerMod.setProvider(new ScriptedProvider(99));
    const run = await newRun("never-fixed");
    await new controllerMod.RunController(run.id).execute();
    const r = (await store.getRun(run.id))!;
    expect(r.status).toBe("failed");
    expect(r.repair_attempts).toBe(2);
    expect(r.error).toMatch(/still failing after 2 repair attempt/);
    expect(r.diff_snapshot?.length).toBeGreaterThan(0); // diff remains reviewable after cleanup
  });

  it("pauses for plan approval when requested and resumes on approval", async () => {
    providerMod.setProvider(new ScriptedProvider(1));
    const run = await newRun("plan-gate", { planApproval: true });
    await new controllerMod.RunController(run.id).execute();
    expect((await store.getRun(run.id))!.status).toBe("awaiting_plan_approval");
    const [ap] = await store.listApprovals(run.id);
    await runner.decide(ap.id, uid, true);
    for (let i = 0; i < 100 && (await store.getRun(run.id))!.status !== "awaiting_publish_approval"; i++) await new Promise((res) => setTimeout(res, 100));
    expect((await store.getRun(run.id))!.status).toBe("awaiting_publish_approval");
    // reject publishing → run cancelled, approval recorded
    const pending = (await store.listApprovals(run.id)).find((a) => a.status === "pending")!;
    await runner.decide(pending.id, uid, false, "not now");
    expect((await store.getRun(run.id))!.status).toBe("cancelled");
  });

  it("reports a missing model key as a clear failure instead of faking progress", async () => {
    providerMod.setProvider(undefined); // default provider from config: NVIDIA Nemotron, no key set
    const { config } = await import("@/server/config");
    expect(config().llm.provider).toBe("nvidia");
    const run = await newRun("no-key");
    await new controllerMod.RunController(run.id).execute();
    const r = (await store.getRun(run.id))!;
    expect(r.status).toBe("failed");
    expect(r.error).toMatch(/NVIDIA_API_KEY is not configured/);
  });
});
