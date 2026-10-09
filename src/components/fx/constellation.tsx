"use client";

import { motion, useReducedMotion } from "motion/react";

/**
 * The hero's signature element: ForgeAI's agent pipeline drawn as a constellation over the
 * galaxy. A single photon travels Plan → Code → Verify → Review → PR, looping back from
 * Verify to Code once to show the bounded repair loop.
 */
const NODES = [
  { id: "plan", x: 70, y: 250, label: "Planner", sub: "reads the repo, writes a plan" },
  { id: "code", x: 190, y: 120, label: "Coder", sub: "edits files in a disposable clone" },
  { id: "verify", x: 330, y: 205, label: "Verifier", sub: "runs your tests in a sandbox" },
  { id: "review", x: 440, y: 95, label: "Reviewer", sub: "checks the diff for risk" },
  { id: "pr", x: 520, y: 260, label: "Pull request", sub: "only after you approve" },
];

const PATH = "M70 250 C 110 180, 140 140, 190 120 S 290 190, 330 205 S 400 110, 440 95 S 510 190, 520 260";
const REPAIR = "M330 205 C 300 260, 220 230, 190 120";

export function Constellation() {
  const reduce = useReducedMotion();
  return (
    <figure className="relative w-full" aria-label="ForgeAI pipeline: planner, coder, verifier, reviewer, then a pull request after your approval">
      <svg viewBox="0 0 590 330" className="w-full overflow-visible" role="img" aria-hidden>
        <defs>
          <linearGradient id="trail" x1="0" x2="1">
            <stop offset="0" stopColor="#8fd0ff" stopOpacity="0.15" />
            <stop offset="0.5" stopColor="#ff9a82" stopOpacity="0.7" />
            <stop offset="1" stopColor="#f2547f" stopOpacity="0.9" />
          </linearGradient>
          <radialGradient id="star">
            <stop offset="0" stopColor="#fff" />
            <stop offset="0.35" stopColor="#ffd2c6" stopOpacity="0.9" />
            <stop offset="1" stopColor="#ff9a82" stopOpacity="0" />
          </radialGradient>
          <filter id="glow" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="3" result="b" />
            <feMerge>
              <feMergeNode in="b" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        <motion.path
          d={PATH}
          fill="none"
          stroke="url(#trail)"
          strokeWidth="1.4"
          initial={reduce ? false : { pathLength: 0, opacity: 0 }}
          animate={{ pathLength: 1, opacity: 1 }}
          transition={{ duration: 2.2, delay: 0.6, ease: [0.22, 1, 0.36, 1] }}
        />
        <motion.path
          d={REPAIR}
          fill="none"
          stroke="#ffc876"
          strokeOpacity="0.45"
          strokeWidth="1"
          strokeDasharray="3 6"
          initial={reduce ? false : { opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 1, delay: 2.4 }}
        />

        {!reduce && (
          <g filter="url(#glow)">
            <circle r="4.5" fill="#fff">
              <animateMotion dur="7s" repeatCount="indefinite" path={PATH} begin="2.6s" keyPoints="0;0.47;0.47;1" keyTimes="0;0.4;0.55;1" calcMode="linear" />
            </circle>
            <circle r="3" fill="#ffc876" opacity="0">
              <animateMotion dur="7s" repeatCount="indefinite" path={REPAIR} begin="2.6s" keyPoints="0;0;1;1" keyTimes="0;0.4;0.55;1" calcMode="linear" />
              <animate attributeName="opacity" dur="7s" repeatCount="indefinite" begin="2.6s" values="0;0;1;0;0" keyTimes="0;0.4;0.47;0.55;1" />
            </circle>
          </g>
        )}

        {NODES.map((n, i) => (
          <motion.g
            key={n.id}
            initial={reduce ? false : { opacity: 0, scale: 0.4 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.8, delay: 0.7 + i * 0.32, ease: [0.22, 1, 0.36, 1] }}
            style={{ transformOrigin: `${n.x}px ${n.y}px` }}
          >
            <circle cx={n.x} cy={n.y} r="22" fill="url(#star)" opacity="0.55" />
            <circle cx={n.x} cy={n.y} r={n.id === "pr" ? 6 : 4.5} fill={n.id === "pr" ? "#9be8c8" : "#fff"} />
            {n.id === "pr" && <circle cx={n.x} cy={n.y} r="11" fill="none" stroke="#9be8c8" strokeOpacity="0.5" strokeDasharray="2 3" />}
            <text x={n.x} y={n.y + (n.y > 200 ? 40 : -30)} textAnchor="middle" className="fill-star font-display" style={{ fontSize: 19, paintOrder: "stroke", stroke: "rgba(5,6,26,0.75)", strokeWidth: 4, strokeLinejoin: "round" }}>
              {n.label}
            </text>
            <text x={n.x} y={n.y + (n.y > 200 ? 58 : -14)} textAnchor="middle" className="fill-haze" style={{ fontSize: 10.5, letterSpacing: 0.1, paintOrder: "stroke", stroke: "rgba(5,6,26,0.8)", strokeWidth: 3, strokeLinejoin: "round" }}>
              {n.sub}
            </text>
          </motion.g>
        ))}
      </svg>
    </figure>
  );
}
