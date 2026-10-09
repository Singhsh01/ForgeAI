"use client";

import Link from "next/link";
import { motion, useReducedMotion, useScroll, useTransform } from "motion/react";
import { useRef } from "react";
import { GitPullRequest, ShieldCheck, Gauge, Hand, FileSearch, Boxes, ArrowDown } from "lucide-react";
import { Backdrop } from "@/components/fx/backdrop";
import { Constellation } from "@/components/fx/constellation";
import { Reveal } from "@/components/fx/reveal";
import { Logo } from "@/components/fx/logo";
import { Button } from "@/components/ui/button";
import { Panel } from "@/components/ui/panel";

const ease = [0.22, 1, 0.36, 1] as const;

const STEPS = [
  {
    title: "Plan",
    body: "The planning agent reads your issue, ranks the files that matter, inspects them with read-only tools and writes a plan with risks, uncertainty and success criteria. You can require approval before any code is touched.",
  },
  {
    title: "Implement",
    body: "The coding agent edits a disposable clone on a fresh branch. It can read and write files inside that clone and nothing else: no shell, no network, no .git, no CI config.",
  },
  {
    title: "Verify",
    body: "ForgeAI installs dependencies and runs your own test command in a locked-down container with no network. Failures go to the verification agent for diagnosis, then back to the coder, a bounded number of times.",
  },
  {
    title: "Review",
    body: "The review agent reads the final diff with the test evidence and flags security and regression risk, marking which findings it verified and which are assumptions.",
  },
  {
    title: "You decide",
    body: "Nothing leaves your machine until you approve. Then ForgeAI pushes the branch and opens a draft pull request with the plan, the test table and the review attached.",
  },
];

const GUARDRAILS = [
  { icon: Boxes, title: "Sandboxed execution", body: "Each command runs in a throwaway container: dropped capabilities, read-only root, memory, CPU and process limits, and no network for tests." },
  { icon: ShieldCheck, title: "Untrusted by default", body: "README text, issue bodies and test output are passed to models as data, never as instructions. Repository hooks and agent settings are never loaded." },
  { icon: Gauge, title: "Hard budgets", body: "Cost, steps, repair attempts and wall-clock time are capped per run. When a budget runs out, the run stops and says why." },
  { icon: Hand, title: "Human checkpoints", body: "Optional plan approval, mandatory publish approval. Every decision is written to the audit log." },
  { icon: FileSearch, title: "Full trace", body: "Every tool call, allowed or denied, every sandbox command and every token is recorded against an OpenTelemetry trace id." },
];

export default function Landing() {
  const reduce = useReducedMotion();
  const heroRef = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({ target: heroRef, offset: ["start start", "end start"] });
  const heroY = useTransform(scrollYProgress, [0, 1], [0, reduce ? 0 : 120]);
  const heroFade = useTransform(scrollYProgress, [0, 0.8], [1, reduce ? 1 : 0]);

  return (
    <>
      <Backdrop />
      <header className="fixed inset-x-0 top-0 z-40">
        <nav className="mx-auto mt-4 flex max-w-6xl items-center justify-between rounded-full px-4 py-2.5 glass-strong md:px-6" aria-label="Primary">
          <Logo />
          <div className="hidden items-center gap-1 text-sm text-haze md:flex">
            <a href="#how" className="rounded-full px-3 py-1.5 transition-colors hover:text-star">How a run works</a>
            <a href="#guardrails" className="rounded-full px-3 py-1.5 transition-colors hover:text-star">Guardrails</a>
            <a href="#example" className="rounded-full px-3 py-1.5 transition-colors hover:text-star">Example</a>
          </div>
          <Button asChild variant="glass" size="sm">
            <Link href="/app">Open workspace</Link>
          </Button>
        </nav>
      </header>

      <main id="main">
        {/* ── Hero ─────────────────────────────────────────────── */}
        <section ref={heroRef} className="relative flex min-h-[100svh] items-center px-4 pb-16 pt-32 sm:px-6">
          <motion.div style={{ y: heroY, opacity: heroFade }} className="mx-auto grid w-full max-w-6xl items-center gap-12 lg:grid-cols-[1.05fr_1fr]">
            <div>
              <h1 className="font-display text-[clamp(3rem,8.4vw,6.6rem)] leading-[0.92] tracking-[-0.02em] text-star">
                {["Issues in.", "Reviewed pull", "requests out."].map((line, i) => (
                  <motion.span
                    key={line}
                    className="block pb-1"
                    initial={reduce ? false : { opacity: 0, y: 40, filter: "blur(12px)" }}
                    animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
                    transition={{ duration: 1.1, delay: 0.15 + i * 0.14, ease }}
                  >
                    {line}
                  </motion.span>
                ))}
              </h1>
              <motion.p
                className="glass mt-7 max-w-[36rem] rounded-[22px] px-6 py-5 text-[17px] leading-relaxed text-star/90"
                initial={reduce ? false : { opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.9, delay: 0.65, ease }}
              >
                ForgeAI is an autonomous software engineer for your repositories. Give it a GitHub issue or a plain-language request; it plans the change, edits a disposable clone, runs your tests in a sandbox, reviews its own diff, and waits for you before opening a pull request.
              </motion.p>
              <motion.div
                className="mt-9 flex flex-wrap items-center gap-3"
                initial={reduce ? false : { opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.9, delay: 0.8, ease }}
              >
                <Button asChild variant="primary" size="lg">
                  <Link href="/app">
                    <GitPullRequest /> Start a task
                  </Link>
                </Button>
                <Button asChild variant="ghost" size="lg">
                  <a href="#how">
                    See how a run works <ArrowDown />
                  </a>
                </Button>
              </motion.div>
            </div>
            <div className="relative mx-auto w-full max-w-[600px]">
              <Constellation />
            </div>
          </motion.div>
        </section>

        {/* ── How a run works ──────────────────────────────────── */}
        <section id="how" className="relative px-4 py-28 sm:px-6">
          <div className="mx-auto max-w-6xl">
            <Reveal>
              <h2 className="max-w-3xl font-display text-[clamp(2.2rem,5vw,3.8rem)] leading-[1.02] text-star">Four agents, one controller, and you at the end.</h2>
              <p className="glass mt-6 max-w-2xl rounded-[22px] px-6 py-5 text-[17px] leading-relaxed text-star/90">
                The agents never talk to each other directly. A workflow controller hands work from one to the next, runs every command itself, and stops the run when a budget is spent.
              </p>
            </Reveal>
            <ol className="relative mt-16 grid gap-5 md:grid-cols-5">
              <div aria-hidden className="absolute left-0 right-0 top-[30px] hidden h-px bg-[linear-gradient(90deg,transparent,rgba(255,154,130,0.5),rgba(143,208,255,0.4),transparent)] md:block" />
              {STEPS.map((s, i) => (
                <Reveal key={s.title} delay={i * 0.08} className="h-full">
                  <li className="relative flex h-full flex-col">
                    <span className="relative z-[1] mb-5 grid size-[60px] place-items-center rounded-full border border-white/12 bg-[rgba(10,12,38,0.75)] font-display text-2xl text-ember backdrop-blur-md">
                      {i + 1}
                    </span>
                    <div className="glass flex-1 rounded-[var(--radius-card)] px-5 py-4">
                      <h3 className="font-display text-[26px] text-star">{s.title}</h3>
                      <p className="mt-2 text-[14.5px] leading-relaxed text-star/85">{s.body}</p>
                    </div>
                  </li>
                </Reveal>
              ))}
            </ol>
          </div>
        </section>

        {/* ── Example ─────────────────────────────────────────── */}
        <section id="example" className="relative px-4 py-24 sm:px-6">
          <div className="mx-auto grid max-w-6xl items-center gap-10 lg:grid-cols-[0.9fr_1.1fr]">
            <Reveal>
              <h2 className="font-display text-[clamp(2rem,4.4vw,3.4rem)] leading-[1.04] text-star">A request, as you would write it.</h2>
              <p className="glass mt-6 max-w-xl rounded-[22px] px-6 py-5 text-[16px] leading-relaxed text-star/90">
                This is task <code className="rounded bg-white/10 px-1.5 py-0.5 font-mono text-[13px] text-star">auth-001</code> from ForgeAI&apos;s evaluation suite. The fixture repository ships with the bug below and a hidden test that fails until it is fixed. The diff shows the minimal fix the task&apos;s acceptance criteria require; run <code className="rounded bg-white/10 px-1.5 py-0.5 font-mono text-[13px] text-star">npm run eval</code> with your own API key to see what ForgeAI actually produces.
              </p>
            </Reveal>
            <Reveal delay={0.1}>
              <Panel tilt className="overflow-hidden">
                <div className="border-b hairline px-6 py-5">
                  <p className="text-[13px] text-dim">Task</p>
                  <p className="mt-1 font-display text-[22px] leading-snug text-star">Fix the authentication bug causing expired sessions to remain valid.</p>
                </div>
                <pre className="overflow-x-auto px-6 py-5 font-mono text-[13px] leading-6" aria-label="Example diff">
                  <span className="text-dim">{"// src/auth/session.js\n"}</span>
                  <span className="text-haze">{"export function isSessionValid(session, now = Date.now()) {\n"}</span>
                  <span className="block bg-danger/10 text-danger">{"-  return Boolean(session && session.token);\n"}</span>
                  <span className="block bg-aurora/10 text-aurora">{"+  if (!session || !session.token) return false;\n"}</span>
                  <span className="block bg-aurora/10 text-aurora">{"+  return typeof session.expiresAt === \"number\" && session.expiresAt > now;\n"}</span>
                  <span className="text-haze">{"}"}</span>
                </pre>
                <div className="flex flex-wrap gap-x-6 gap-y-2 border-t hairline px-6 py-4 text-[13px] text-haze">
                  <span>Hidden tests: expired, missing and future expiry</span>
                  <span>Unrelated files touched: must be zero</span>
                </div>
              </Panel>
            </Reveal>
          </div>
        </section>

        {/* ── Guardrails ───────────────────────────────────────── */}
        <section id="guardrails" className="relative px-4 py-28 sm:px-6">
          <div className="mx-auto max-w-6xl">
            <Reveal>
              <h2 className="max-w-3xl font-display text-[clamp(2.2rem,5vw,3.8rem)] leading-[1.02] text-star">Autonomous, inside a fence you can see.</h2>
            </Reveal>
            <div className="mt-14 grid gap-4 md:grid-cols-6">
              {GUARDRAILS.map((g, i) => (
                <Reveal key={g.title} delay={i * 0.06} className={i < 2 ? "md:col-span-3" : "md:col-span-2"}>
                  <Panel tilt className="h-full p-7">
                    <g.icon className="size-5 text-ember" aria-hidden />
                    <h3 className="mt-5 font-display text-[24px] text-star">{g.title}</h3>
                    <p className="mt-2 text-[14.5px] leading-relaxed text-star/85">{g.body}</p>
                  </Panel>
                </Reveal>
              ))}
            </div>
          </div>
        </section>

        {/* ── Closing ──────────────────────────────────────────── */}
        <section className="relative px-4 pb-24 pt-10 sm:px-6">
          <Reveal>
            <Panel className="luminous mx-auto max-w-4xl px-8 py-14 text-center md:px-16">
              <h2 className="font-display text-[clamp(2rem,4.6vw,3.4rem)] leading-[1.04] text-star">Connect a repository and hand over the next issue.</h2>
              <p className="mx-auto mt-4 max-w-xl text-star/85">Runs locally with a free NVIDIA Nemotron or Google Gemini key and a scoped GitHub token. Your credentials stay on your machine.</p>
              <div className="mt-8 flex justify-center">
                <Button asChild variant="primary" size="lg">
                  <Link href="/app">Open workspace</Link>
                </Button>
              </div>
            </Panel>
          </Reveal>
          <footer className="mx-auto mt-16 flex max-w-6xl flex-wrap items-center justify-between gap-4 text-sm text-dim">
            <Logo />
            <p>Powered by NVIDIA Nemotron or Google Gemini, Next.js and a lot of sandboxing.</p>
          </footer>
        </section>
      </main>
    </>
  );
}
