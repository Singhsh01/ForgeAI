"use client";

import { useEffect, useMemo, useState } from "react";
import { ReactFlow, Handle, Position, type Node, type Edge, type NodeProps } from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { Check, X as XIcon, Hand } from "lucide-react";
import type { RunStatus } from "@/lib/types";
import { cn } from "@/lib/utils";

type StageState = "done" | "active" | "waiting" | "pending" | "failed" | "skipped";
type StageData = { label: string; agent: string; state: StageState; bare?: boolean };

const STAGES: { id: string; label: string; agent: string; statuses: RunStatus[] }[] = [
  { id: "prepare", label: "Prepare", agent: "Controller", statuses: ["queued", "preparing"] },
  { id: "plan", label: "Plan", agent: "Planner", statuses: ["planning", "awaiting_plan_approval"] },
  { id: "code", label: "Implement", agent: "Coder", statuses: ["coding"] },
  { id: "verify", label: "Verify", agent: "Sandbox", statuses: ["verifying"] },
  { id: "repair", label: "Diagnose", agent: "Verifier", statuses: ["repairing"] },
  { id: "review", label: "Review", agent: "Reviewer", statuses: ["reviewing"] },
  { id: "approve", label: "Your approval", agent: "Human", statuses: ["awaiting_publish_approval"] },
  { id: "publish", label: "Pull request", agent: "Controller", statuses: ["publishing", "completed"] },
];
const ORDER = STAGES.map((s) => s.id);

export function stageIdFor(status: RunStatus): string | null {
  return STAGES.find((s) => s.statuses.includes(status))?.id ?? null;
}

export function stageIndexFor(status: RunStatus, lastActive?: string) {
  const i = STAGES.findIndex((s) => s.statuses.includes(status));
  if (i >= 0) return i;
  return lastActive ? ORDER.indexOf(lastActive) : 0;
}

function StageNode({ data }: NodeProps<Node<StageData>>) {
  const s = data.state;
  return (
    <div
      className={cn(
        "relative w-full min-w-[132px] md:w-[132px] rounded-2xl border px-3.5 py-3 backdrop-blur-md transition-all duration-500",
        s === "active" && "luminous luminous-ion border-transparent bg-ion/[0.09] shadow-[var(--glow-ion)]",
        s === "waiting" && "luminous border-transparent bg-warn/[0.08]",
        s === "done" && "border-ember/30 bg-ember/[0.06]",
        s === "failed" && "border-danger/50 bg-danger/10",
        (s === "pending" || s === "skipped") && "border-white/8 bg-white/[0.025]",
      )}
    >
      {!data.bare && <Handle type="target" position={Position.Left} />}
      <div className="flex items-center justify-between">
        <span className={cn("text-[13.5px]", s === "pending" || s === "skipped" ? "text-dim" : "text-star")}>{data.label}</span>
        {s === "done" && <Check className="size-3.5 text-ember" />}
        {s === "failed" && <XIcon className="size-3.5 text-danger" />}
        {s === "waiting" && <Hand className="size-3.5 text-warn" />}
        {s === "active" && <span className="live-dot size-2 rounded-full bg-ion" />}
      </div>
      <span className="mt-0.5 block text-[11.5px] text-dim">{data.agent}</span>
      {!data.bare && <Handle type="source" position={Position.Right} />}
    </div>
  );
}

const nodeTypes = { stage: StageNode };

export function WorkflowGraph(props: { status: RunStatus; failedAt?: string | null; repairs: number }) {
  const [narrow, setNarrow] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 767px)");
    const on = () => setNarrow(mq.matches);
    on();
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);
  return narrow ? <StageList {...props} /> : <FlowGraph {...props} />;
}

/** Compact vertical stepper used on phones, where the graph would be too small to read. */
function StageList({ status, failedAt, repairs }: { status: RunStatus; failedAt?: string | null; repairs: number }) {
  const nodes = computeNodes(status, failedAt, repairs).filter((n) => n.data.state !== "skipped");
  return (
    <ol className="space-y-1.5 px-2 pb-3 pt-4" aria-label={`Workflow progress: ${status}`}>
      {nodes.map((n) => (
        <li key={n.id}>
          <StageNode {...({ data: { ...n.data, bare: true } } as NodeProps<Node<StageData>>)} />
        </li>
      ))}
    </ol>
  );
}

function computeNodes(status: RunStatus, failedAt: string | null | undefined, repairs: number): Node<StageData>[] {
  const terminalFail = status === "failed" || status === "cancelled" || status === "interrupted";
  const cur = terminalFail ? (failedAt ? ORDER.indexOf(failedAt) : 0) : stageIndexFor(status);
  return STAGES.map((s, i) => {
    let state: StageState = "pending";
    if (status === "completed") state = "done";
    else if (s.id === "repair") state = status === "repairing" ? "active" : repairs > 0 ? "done" : "skipped";
    else if (i < cur) state = "done";
    else if (i === cur) state = terminalFail ? "failed" : status.startsWith("awaiting") ? "waiting" : "active";
    return { id: s.id, type: "stage", position: { x: 0, y: 0 }, data: { label: s.label, agent: s.agent, state }, draggable: false, selectable: false };
  });
}

function FlowGraph({ status, failedAt, repairs }: { status: RunStatus; failedAt?: string | null; repairs: number }) {
  const { nodes, edges } = useMemo(() => {
    const terminalFail = status === "failed" || status === "cancelled" || status === "interrupted";
    const cur = terminalFail ? (failedAt ? ORDER.indexOf(failedAt) : 0) : stageIndexFor(status);
    const positions: Record<string, { x: number; y: number }> = {
      prepare: { x: 0, y: 60 }, plan: { x: 165, y: 60 }, code: { x: 330, y: 60 }, verify: { x: 495, y: 60 },
      repair: { x: 412, y: 170 }, review: { x: 660, y: 60 }, approve: { x: 825, y: 60 }, publish: { x: 990, y: 60 },
    };
    const nodes = computeNodes(status, failedAt, repairs).map((n) => ({ ...n, position: positions[n.id] }));
    const mk = (a: string, b: string, extra: Partial<Edge> = {}): Edge => {
      const ai = ORDER.indexOf(a);
      const reached = status === "completed" || ai < cur;
      return {
        id: `${a}-${b}`, source: a, target: b, animated: ORDER.indexOf(b) === cur && !terminalFail,
        style: { stroke: reached ? "rgba(255,154,130,0.6)" : "rgba(246,244,255,0.16)", strokeWidth: 1.5 }, ...extra,
      };
    };
    const edges: Edge[] = [
      mk("prepare", "plan"), mk("plan", "code"), mk("code", "verify"),
      { id: "verify-repair", source: "verify", target: "repair", type: "smoothstep", animated: status === "repairing", style: { stroke: repairs > 0 ? "rgba(255,200,118,0.6)" : "rgba(246,244,255,0.1)", strokeDasharray: "4 5" } },
      { id: "repair-code", source: "repair", target: "code", type: "smoothstep", animated: status === "repairing", style: { stroke: repairs > 0 ? "rgba(255,200,118,0.6)" : "rgba(246,244,255,0.1)", strokeDasharray: "4 5" } },
      mk("verify", "review"), mk("review", "approve"), mk("approve", "publish"),
    ];
    return { nodes, edges };
  }, [status, failedAt, repairs]);

  return (
    <div className="h-[240px] w-full" aria-label={`Workflow progress: ${status}`} role="img">
      <ReactFlow
        nodes={nodes} edges={edges} nodeTypes={nodeTypes} fitView fitViewOptions={{ padding: 0.12 }}
        proOptions={{ hideAttribution: true }} nodesConnectable={false} nodesDraggable={false} elementsSelectable={false}
        zoomOnScroll={false} zoomOnPinch panOnDrag={[1]} preventScrolling={false} minZoom={0.3} maxZoom={1.2}
      />
    </div>
  );
}
