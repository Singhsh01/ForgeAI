// Shared (client + server) domain types. Keep free of server imports.

export const RUN_STATUSES = [
  "queued",
  "preparing",
  "planning",
  "awaiting_plan_approval",
  "coding",
  "verifying",
  "repairing",
  "reviewing",
  "awaiting_publish_approval",
  "publishing",
  "completed",
  "failed",
  "cancelled",
  "interrupted",
] as const;
export type RunStatus = (typeof RUN_STATUSES)[number];

export const TERMINAL_STATUSES: RunStatus[] = ["completed", "failed", "cancelled"];
export const WAITING_STATUSES: RunStatus[] = ["awaiting_plan_approval", "awaiting_publish_approval"];

export type AgentName = "controller" | "planner" | "coder" | "verifier" | "reviewer";

export interface RepoConnection {
  id: string;
  kind: "github" | "local";
  full_name: string;
  clone_url: string;
  default_branch: string;
  is_private: boolean;
  metadata: Record<string, unknown>;
  created_at: string;
}

export interface Task {
  id: string;
  repo_id: string;
  title: string;
  description: string;
  source: "issue" | "freeform" | "eval";
  issue_number: number | null;
  issue_url: string | null;
  require_plan_approval: boolean;
  created_at: string;
}

export interface Plan {
  summary: string;
  understanding: string;
  relevantFiles: { path: string; reason: string }[];
  steps: { title: string; detail: string; files: string[] }[];
  risks: { description: string; severity: "low" | "medium" | "high" }[];
  uncertainty: "low" | "medium" | "high";
  successCriteria: string[];
  testStrategy: string;
}

export interface Review {
  verdict: "approve" | "request_changes" | "comment";
  summary: string;
  requirementsMet: { requirement: string; met: boolean; evidence: string }[];
  comments: { file: string; line?: number; severity: "info" | "warning" | "critical"; category: string; body: string; basis: "verified" | "assumption" }[];
  securityConcerns: string[];
  regressionRisks: string[];
  commitMessage: string;
  prTitle: string;
}

export interface AgentRun {
  id: string;
  task_id: string;
  status: RunStatus;
  phase: string;
  active_agent: AgentName | null;
  branch: string | null;
  base_sha: string | null;
  head_sha: string | null;
  workspace_path?: string | null;
  trace_id: string;
  model: string;
  context_strategy: string | null;
  plan: Plan | null;
  review: Review | null;
  diff_stats: { files: number; additions: number; deletions: number } | null;
  diff_snapshot?: FileDiff[] | null;
  project?: { ecosystem: string; install?: string; test?: string; lint?: string; notes: string[] } | null;
  repair_attempts: number;
  steps: number;
  input_tokens: number;
  output_tokens: number;
  cache_read_tokens: number;
  cost_usd: number;
  error: string | null;
  pr_url: string | null;
  pr_number: number | null;
  budget: { maxCostUsd: number; maxRepairAttempts: number; maxAgentTurns: number; maxSteps: number; timeoutMs: number; maxTokens?: number };
  started_at: string;
  finished_at: string | null;
  updated_at: string;
}

export interface ExecutionEvent {
  id: number;
  run_id: string;
  seq: number;
  type: "phase" | "log" | "agent_message" | "tool_call" | "test" | "error" | "approval" | "budget" | "status";
  agent: AgentName | null;
  level: "debug" | "info" | "warn" | "error";
  message: string;
  data: Record<string, unknown> | null;
  created_at: string;
}

export interface TestResult {
  id: string;
  run_id: string;
  attempt: number;
  kind: "install" | "test" | "lint" | "build";
  command: string;
  sandbox: string;
  exit_code: number | null;
  passed: boolean;
  timed_out: boolean;
  duration_ms: number;
  summary: { passed?: number; failed?: number; total?: number } | null;
  output_tail: string | null;
  created_at: string;
}

export interface ApprovalRequest {
  id: string;
  run_id: string;
  kind: "plan" | "publish_pr";
  status: "pending" | "approved" | "rejected" | "expired";
  summary: string;
  payload: Record<string, unknown> | null;
  decided_at: string | null;
  comment: string | null;
  created_at: string;
}

export interface ToolCall {
  id: string;
  run_id: string;
  agent: AgentName;
  tool_name: string;
  input: Record<string, unknown> | null;
  decision: "allowed" | "denied";
  deny_reason: string | null;
  created_at: string;
}

export interface FileDiff {
  path: string;
  status: "added" | "modified" | "deleted" | "renamed";
  additions: number;
  deletions: number;
  original: string;
  modified: string;
  language: string;
}
