"use client";

import * as React from "react";
import { motion, type HTMLMotionProps } from "motion/react";
import { cn } from "@/lib/utils";

/** Primary glass surface. `tilt` adds a subtle pointer-follow light for interactive cards. */
export function Panel({ className, children, tilt, ...props }: HTMLMotionProps<"div"> & { tilt?: boolean }) {
  const ref = React.useRef<HTMLDivElement>(null);
  const onMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!tilt || !ref.current) return;
    const r = ref.current.getBoundingClientRect();
    ref.current.style.setProperty("--mx", `${e.clientX - r.left}px`);
    ref.current.style.setProperty("--my", `${e.clientY - r.top}px`);
  };
  return (
    <motion.div
      ref={ref}
      onPointerMove={onMove}
      className={cn(
        "glass relative rounded-[var(--radius-panel)]",
        tilt &&
          "transition-[border-color,transform] duration-500 ease-[var(--ease-cinema)] hover:-translate-y-0.5 hover:border-[var(--glass-line-strong)] before:pointer-events-none before:absolute before:inset-0 before:rounded-[inherit] before:opacity-0 before:transition-opacity before:duration-500 hover:before:opacity-100 before:bg-[radial-gradient(420px_circle_at_var(--mx,50%)_var(--my,50%),rgba(255,154,130,0.09),transparent_45%)]",
        className,
      )}
      {...props}
    >
      {children}
    </motion.div>
  );
}

export function SectionTitle({ title, hint, action }: { title: string; hint?: string; action?: React.ReactNode }) {
  return (
    <div className="mb-4 flex items-end justify-between gap-4">
      <div>
        <h2 className="font-display text-[26px] leading-tight text-star">{title}</h2>
        {hint && <p className="mt-1 text-sm text-dim">{hint}</p>}
      </div>
      {action}
    </div>
  );
}
