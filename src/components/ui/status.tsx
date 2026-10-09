import { cn } from "@/lib/utils";
import type { RunStatus } from "@/lib/types";

const TONE: Record<RunStatus, { label: string; cls: string; live?: boolean }> = {
  queued: { label: "Queued", cls: "text-haze border-white/15 bg-white/5" },
  preparing: { label: "Preparing", cls: "text-ion border-ion/30 bg-ion/10", live: true },
  planning: { label: "Planning", cls: "text-ion border-ion/30 bg-ion/10", live: true },
  awaiting_plan_approval: { label: "Needs plan approval", cls: "text-warn border-warn/35 bg-warn/10" },
  coding: { label: "Implementing", cls: "text-ion border-ion/30 bg-ion/10", live: true },
  verifying: { label: "Verifying", cls: "text-ion border-ion/30 bg-ion/10", live: true },
  repairing: { label: "Repairing", cls: "text-warn border-warn/35 bg-warn/10", live: true },
  reviewing: { label: "Reviewing", cls: "text-ion border-ion/30 bg-ion/10", live: true },
  awaiting_publish_approval: { label: "Ready to publish", cls: "text-warn border-warn/35 bg-warn/10" },
  publishing: { label: "Publishing", cls: "text-ion border-ion/30 bg-ion/10", live: true },
  completed: { label: "Completed", cls: "text-aurora border-aurora/35 bg-aurora/10" },
  failed: { label: "Failed", cls: "text-danger border-danger/35 bg-danger/10" },
  cancelled: { label: "Cancelled", cls: "text-dim border-white/12 bg-white/5" },
  interrupted: { label: "Interrupted", cls: "text-warn border-warn/35 bg-warn/10" },
};

export function StatusPill({ status, className }: { status: RunStatus | null | undefined; className?: string }) {
  if (!status) return <span className={cn("rounded-full border border-white/10 px-2.5 py-0.5 text-xs text-dim", className)}>No runs</span>;
  const t = TONE[status];
  return (
    <span className={cn("inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium", t.cls, className)}>
      <span className={cn("size-1.5 rounded-full bg-current", t.live && "live-dot")} />
      {t.label}
    </span>
  );
}

export function isLiveStatus(s: RunStatus | null | undefined) {
  return !!s && !!TONE[s].live;
}
