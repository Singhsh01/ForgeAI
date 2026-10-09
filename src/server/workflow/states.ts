import type { RunStatus } from "@/lib/types";

/**
 * Agent execution state machine. Every status change goes through `assertTransition`,
 * so the controller can never skip verification or publish without approval.
 *
 *  queued → preparing → planning → (awaiting_plan_approval) → coding → verifying
 *  verifying → repairing → coding (bounded by maxRepairAttempts)
 *  verifying → reviewing → awaiting_publish_approval → publishing → completed
 *  any active state → failed | cancelled | interrupted (process restart)
 *  interrupted → preparing | coding (resume from checkpoint)
 */
export const TRANSITIONS: Record<RunStatus, RunStatus[]> = {
  queued: ["preparing", "cancelled", "failed", "interrupted"],
  preparing: ["planning", "failed", "cancelled", "interrupted"],
  planning: ["awaiting_plan_approval", "coding", "failed", "cancelled", "interrupted"],
  awaiting_plan_approval: ["coding", "cancelled", "failed"],
  coding: ["verifying", "failed", "cancelled", "interrupted"],
  verifying: ["repairing", "reviewing", "failed", "cancelled", "interrupted"],
  repairing: ["coding", "failed", "cancelled", "interrupted"],
  reviewing: ["awaiting_publish_approval", "failed", "cancelled", "interrupted"],
  awaiting_publish_approval: ["publishing", "cancelled", "failed"],
  publishing: ["completed", "failed", "interrupted"],
  completed: [],
  failed: [],
  cancelled: [],
  interrupted: ["preparing", "coding", "cancelled", "failed"],
};

export class InvalidTransition extends Error {}

export function canTransition(from: RunStatus, to: RunStatus) {
  return TRANSITIONS[from]?.includes(to) ?? false;
}

export function assertTransition(from: RunStatus, to: RunStatus) {
  if (!canTransition(from, to)) throw new InvalidTransition(`Illegal run transition ${from} → ${to}`);
}

export const PHASE_LABEL: Record<RunStatus, string> = {
  queued: "Queued",
  preparing: "Preparing workspace",
  planning: "Planning",
  awaiting_plan_approval: "Awaiting plan approval",
  coding: "Implementing",
  verifying: "Verifying in sandbox",
  repairing: "Diagnosing failure",
  reviewing: "Reviewing diff",
  awaiting_publish_approval: "Awaiting publish approval",
  publishing: "Publishing",
  completed: "Completed",
  failed: "Failed",
  cancelled: "Cancelled",
  interrupted: "Interrupted",
};
