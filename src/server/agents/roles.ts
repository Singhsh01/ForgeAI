import type { AgentName } from "@/lib/types";
import { getProvider, type AgentResult, type AgentSpec } from "./provider";
import { CODER_SYSTEM, PLANNER_SYSTEM, REVIEWER_SYSTEM, VERIFIER_SYSTEM } from "./prompts";
import {
  CoderReportSchema, jsonSchemaOf, parseStructured, PlanSchema, ReviewSchema, VerificationFeedbackSchema,
  type CoderReport, type PlanOut, type ReviewOut, type VerificationFeedback,
} from "./schemas";
import { untrusted } from "../context";

export interface RoleHooks {
  signal: AbortSignal;
  maxTurns: number;
  maxBudgetUsd: number;
  onToolCall: AgentSpec["onToolCall"];
  onText: AgentSpec["onText"];
  onUsage: (agent: AgentName, r: AgentResult) => Promise<void>;
}

async function runRole<T>(agent: AgentName, spec: Omit<AgentSpec, "agent" | "signal" | "maxTurns" | "maxBudgetUsd" | "onToolCall" | "onText">, hooks: RoleHooks, parse: (r: AgentResult) => T): Promise<T> {
  const r = await getProvider().run({ ...spec, agent, signal: hooks.signal, maxTurns: hooks.maxTurns, maxBudgetUsd: hooks.maxBudgetUsd, onToolCall: hooks.onToolCall, onText: hooks.onText });
  await hooks.onUsage(agent, r);
  if (!r.ok) throw new Error(`${agent} agent failed: ${r.error ?? r.stopReason}`);
  return parse(r);
}

export function plan(input: { cwd: string; task: string; issueText?: string; context: string }, hooks: RoleHooks): Promise<PlanOut> {
  const prompt = `# Operator task (authoritative)
${input.task}

${input.issueText ? untrusted("github-issue", input.issueText) : ""}

# Pre-computed repository context
${untrusted("repository-context", input.context)}

Inspect the files you need with your read-only tools, then return the implementation plan as JSON.`;
  return runRole("planner", { systemPrompt: PLANNER_SYSTEM, prompt, cwd: input.cwd, write: false, outputSchema: jsonSchemaOf(PlanSchema) }, hooks, (r) => parseStructured(PlanSchema, r.structured, r.text));
}

export function code(input: { cwd: string; task: string; plan: PlanOut; feedback?: VerificationFeedback & { output: string }; attempt: number }, hooks: RoleHooks): Promise<CoderReport> {
  const repair = input.feedback
    ? `\n# Repair attempt ${input.attempt}\nThe previous implementation failed verification in the sandbox.\nRoot cause: ${input.feedback.rootCause}\nFailing tests: ${input.feedback.failingTests.join(", ") || "n/a"}\nSuggested fix: ${input.feedback.suggestedFix}\n${untrusted("sandbox-output", input.feedback.output.slice(-6000))}\nFix the problem with the smallest change. Do not weaken or delete tests to make them pass.`
    : "";
  const prompt = `# Operator task (authoritative)
${input.task}

# Approved implementation plan
${JSON.stringify(input.plan, null, 2)}
${repair}

Implement the change now. Then reply with the JSON report.`;
  return runRole("coder", { systemPrompt: CODER_SYSTEM, prompt, cwd: input.cwd, write: true, outputSchema: jsonSchemaOf(CoderReportSchema) }, hooks, (r) => {
    try {
      return parseStructured(CoderReportSchema, r.structured, r.text);
    } catch {
      return { summary: r.text.slice(0, 1500), filesChanged: [], testsAddedOrUpdated: [], followUps: [] };
    }
  });
}

export function diagnose(input: { cwd: string; task: string; command: string; output: string; diff: string }, hooks: RoleHooks): Promise<VerificationFeedback> {
  const prompt = `# Operator task (authoritative)
${input.task}

# Sandbox command that failed
${input.command}

${untrusted("sandbox-output", input.output.slice(-12000))}

${untrusted("current-diff", input.diff.slice(0, 30000))}

Diagnose the failure and return JSON.`;
  return runRole("verifier", { systemPrompt: VERIFIER_SYSTEM, prompt, cwd: input.cwd, write: false, outputSchema: jsonSchemaOf(VerificationFeedbackSchema) }, hooks, (r) => parseStructured(VerificationFeedbackSchema, r.structured, r.text));
}

export function review(input: { cwd: string; task: string; plan: PlanOut; diff: string; testEvidence: string }, hooks: RoleHooks): Promise<ReviewOut> {
  const prompt = `# Operator task (authoritative)
${input.task}

# Success criteria from the plan
${input.plan.successCriteria.map((c) => `- ${c}`).join("\n")}

# Test evidence (executed by ForgeAI in the sandbox — verified facts)
${input.testEvidence}

${untrusted("final-diff", input.diff)}

Review the change and return JSON.`;
  return runRole("reviewer", { systemPrompt: REVIEWER_SYSTEM, prompt, cwd: input.cwd, write: false, outputSchema: jsonSchemaOf(ReviewSchema) }, hooks, (r) => parseStructured(ReviewSchema, r.structured, r.text));
}
