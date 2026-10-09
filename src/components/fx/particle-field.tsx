"use client";

import { useEffect, useRef } from "react";

/**
 * Lightweight canvas particle field layered over the galaxy photo. Particles are tinted with
 * the photo's own palette, drift slowly toward the viewer, and lean away from the pointer.
 * Pauses when the tab is hidden and renders nothing under prefers-reduced-motion.
 */
export function ParticleField({ density = 1 }: { density?: number }) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)");
    if (reduce.matches) return;
    const ctx = canvas.getContext("2d", { alpha: true });
    if (!ctx) return;

    const palette = ["255,190,170", "255,154,130", "242,84,127", "246,244,255", "143,208,255"];
    let w = 0, h = 0, dpr = 1, raf = 0, running = true;
    const pointer = { x: 0.5, y: 0.5, tx: 0.5, ty: 0.5 };
    type P = { x: number; y: number; z: number; r: number; c: string; tw: number };
    let ps: P[] = [];

    const resize = () => {
      dpr = Math.min(window.devicePixelRatio || 1, 1.75);
      w = canvas.clientWidth;
      h = canvas.clientHeight;
      canvas.width = Math.floor(w * dpr);
      canvas.height = Math.floor(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const count = Math.round(Math.min(220, (w * h) / 9000) * density);
      ps = Array.from({ length: count }, () => spawn(true));
    };
    const spawn = (anywhere: boolean): P => ({
      x: (Math.random() - 0.5) * 2,
      y: (Math.random() - 0.5) * 2,
      z: anywhere ? Math.random() * 0.9 + 0.1 : 1,
      r: Math.random() * 1.1 + 0.25,
      c: palette[Math.random() < 0.08 ? 4 : Math.floor(Math.random() * 4)],
      tw: Math.random() * Math.PI * 2,
    });

    let last = performance.now();
    const frame = (now: number) => {
      if (!running) return;
      const dt = Math.min(48, now - last) / 16.67;
      last = now;
      pointer.x += (pointer.tx - pointer.x) * 0.04;
      pointer.y += (pointer.ty - pointer.y) * 0.04;
      ctx.clearRect(0, 0, w, h);
      // vanishing point sits at the galaxy's bright core (left-centre of the photo)
      const cx = w * (0.38 + (pointer.x - 0.5) * 0.06);
      const cy = h * (0.48 + (pointer.y - 0.5) * 0.06);
      for (let i = 0; i < ps.length; i++) {
        const p = ps[i];
        p.z -= 0.0011 * dt;
        p.tw += 0.03 * dt;
        if (p.z <= 0.04) {
          ps[i] = spawn(false);
          continue;
        }
        const k = 0.55 / p.z;
        const x = cx + p.x * w * 0.5 * k;
        const y = cy + p.y * h * 0.5 * k;
        if (x < -20 || x > w + 20 || y < -20 || y > h + 20) {
          ps[i] = spawn(false);
          continue;
        }
        const depth = 1 - p.z;
        const alpha = Math.min(0.85, depth * 0.9) * (0.65 + Math.sin(p.tw) * 0.35);
        const r = p.r * (0.6 + depth * 1.8);
        ctx.beginPath();
        ctx.fillStyle = `rgba(${p.c},${alpha.toFixed(3)})`;
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fill();
        if (r > 1.6) {
          ctx.beginPath();
          ctx.fillStyle = `rgba(${p.c},${(alpha * 0.12).toFixed(3)})`;
          ctx.arc(x, y, r * 4, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      raf = requestAnimationFrame(frame);
    };

    const onMove = (e: PointerEvent) => {
      pointer.tx = e.clientX / window.innerWidth;
      pointer.ty = e.clientY / window.innerHeight;
    };
    const onVis = () => {
      running = !document.hidden;
      if (running) {
        last = performance.now();
        raf = requestAnimationFrame(frame);
      } else cancelAnimationFrame(raf);
    };

    resize();
    raf = requestAnimationFrame(frame);
    window.addEventListener("resize", resize);
    window.addEventListener("pointermove", onMove, { passive: true });
    document.addEventListener("visibilitychange", onVis);
    return () => {
      running = false;
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
      window.removeEventListener("pointermove", onMove);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [density]);

  return <canvas ref={ref} aria-hidden className="pointer-events-none absolute inset-0 h-full w-full mix-blend-screen" />;
}
