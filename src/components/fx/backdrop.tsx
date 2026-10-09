"use client";

import { motion, useReducedMotion, useScroll, useSpring, useTransform, useMotionValue } from "motion/react";
import { useEffect } from "react";
import { ParticleField } from "./particle-field";
import { GALAXY_BLUR } from "@/lib/galaxy-blur";

/**
 * Full-screen cinematic backdrop built on the original galaxy photograph (served untouched
 * from /galaxy.jpg — no recompression). Layers, back to front:
 *   photo (scroll + pointer parallax) → ambient light orbs → particle field → readability scrims
 * `intensity="quiet"` deepens the scrim for dense app screens.
 */
export function Backdrop({ intensity = "cinematic" }: { intensity?: "cinematic" | "quiet" }) {
  const reduce = useReducedMotion();
  const { scrollYProgress } = useScroll();
  const y = useTransform(scrollYProgress, [0, 1], ["0%", reduce ? "0%" : "-8%"]);
  const px = useMotionValue(0);
  const py = useMotionValue(0);
  const sx = useSpring(px, { stiffness: 40, damping: 20 });
  const sy = useSpring(py, { stiffness: 40, damping: 20 });

  useEffect(() => {
    if (reduce) return;
    const onMove = (e: PointerEvent) => {
      px.set((e.clientX / window.innerWidth - 0.5) * -18);
      py.set((e.clientY / window.innerHeight - 0.5) * -12);
    };
    window.addEventListener("pointermove", onMove, { passive: true });
    return () => window.removeEventListener("pointermove", onMove);
  }, [reduce, px, py]);

  const quiet = intensity === "quiet";

  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 -z-10 overflow-hidden bg-void">
      <motion.div className="absolute -inset-[6%]" style={{ y }}>
        <motion.div className="h-full w-full" style={{ x: sx, y: sy }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/galaxy.jpg"
          alt=""
          fetchPriority="high"
          decoding="async"
          className="h-full w-full object-cover object-[30%_50%] md:object-center"
          style={{ backgroundImage: `url(${GALAXY_BLUR})`, backgroundSize: "cover" }}
        />
        </motion.div>
      </motion.div>

      {/* ambient light — warm bloom over the nebula core, cool rim light to the right */}
      <div className="orb-a absolute left-[-10%] top-[20%] h-[55vmax] w-[55vmax] rounded-full bg-[radial-gradient(circle,rgba(255,120,110,0.22),transparent_62%)] blur-2xl" />
      <div className="orb-b absolute right-[-15%] top-[-10%] h-[50vmax] w-[50vmax] rounded-full bg-[radial-gradient(circle,rgba(110,150,255,0.14),transparent_60%)] blur-2xl" />

      <ParticleField density={quiet ? 0.55 : 1} />

      {/* readability scrims */}
      <div className={quiet ? "absolute inset-0 bg-[rgba(5,6,26,0.58)]" : "absolute inset-0 bg-[linear-gradient(90deg,rgba(5,6,26,0.6)_0%,rgba(5,6,26,0.28)_50%,rgba(5,6,26,0.12)_100%)]"} />
      {!quiet && <div className="absolute inset-0 bg-[rgba(5,6,26,0.3)] md:hidden" />}
      <div className="absolute inset-x-0 bottom-0 h-[45vh] bg-[linear-gradient(to_top,var(--color-void),transparent)]" />
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_40%,rgba(3,4,16,0.65)_100%)]" />
      {/* fine grain keeps gradients from banding */}
      <div className="absolute inset-0 opacity-[0.06] mix-blend-overlay [background-image:url('data:image/svg+xml;utf8,<svg xmlns=%22http://www.w3.org/2000/svg%22 width=%22140%22 height=%22140%22><filter id=%22n%22><feTurbulence baseFrequency=%220.9%22 numOctaves=%222%22/></filter><rect width=%22100%25%22 height=%22100%25%22 filter=%22url(%23n)%22/></svg>')]" />
    </div>
  );
}
