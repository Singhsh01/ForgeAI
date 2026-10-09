"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { motion } from "motion/react";
import { LogOut, Menu, X } from "lucide-react";
import { useState } from "react";
import { Logo } from "@/components/fx/logo";
import { Button } from "@/components/ui/button";
import { useApi } from "@/lib/hooks";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";

const LINKS = [
  { href: "/app", label: "Workspace" },
  { href: "/app/observability", label: "Observability" },
  { href: "/app/evals", label: "Evaluations" },
  { href: "/app/settings", label: "Settings" },
];

type System = { llm: { ready: boolean; label: string; model: string }; github: boolean; sandbox: string; sandboxHealth: { ok: boolean; detail: string } };

export function AppNav() {
  const path = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const { data: sys } = useApi<System>("/api/system");
  const ready = sys ? sys.llm.ready && sys.sandboxHealth.ok : null;
  const active = (href: string) => (href === "/app" ? path === "/app" || path.startsWith("/app/runs") : path.startsWith(href));

  const logout = async () => {
    await api("/api/auth/logout", { method: "POST" });
    router.replace("/login");
  };

  return (
    <header className="sticky top-0 z-40 px-3 pt-3 sm:px-4">
      <nav className="glass-strong mx-auto flex max-w-[1400px] items-center justify-between gap-3 rounded-full px-3 py-2 sm:px-5" aria-label="App">
        <Logo href="/app" />
        <ul className="hidden items-center gap-1 md:flex">
          {LINKS.map((l) => (
            <li key={l.href} className="relative">
              <Link href={l.href} className={cn("relative z-[1] block rounded-full px-4 py-1.5 text-sm transition-colors", active(l.href) ? "text-star" : "text-haze hover:text-star")} aria-current={active(l.href) ? "page" : undefined}>
                {l.label}
              </Link>
              {active(l.href) && (
                <motion.span layoutId="nav-pill" className="absolute inset-0 rounded-full border border-white/12 bg-white/[0.08]" transition={{ type: "spring", stiffness: 380, damping: 32 }} />
              )}
            </li>
          ))}
        </ul>
        <div className="flex items-center gap-2">
          <Link href="/app/settings" className="hidden items-center gap-2 rounded-full border border-white/10 px-3 py-1 text-xs text-haze transition-colors hover:text-star sm:inline-flex" title={sys?.sandboxHealth.detail}>
            <span className={cn("size-1.5 rounded-full", ready == null ? "bg-dim" : ready ? "bg-aurora" : "bg-warn")} />
            {ready == null ? "Checking setup" : ready ? "Agents ready" : "Setup incomplete"}
          </Link>
          <Button variant="ghost" size="icon" onClick={logout} aria-label="Sign out" className="hidden md:inline-flex">
            <LogOut />
          </Button>
          <Button variant="ghost" size="icon" className="md:hidden" onClick={() => setOpen((o) => !o)} aria-label="Menu" aria-expanded={open}>
            {open ? <X /> : <Menu />}
          </Button>
        </div>
      </nav>
      {open && (
        <motion.ul initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} className="glass-strong mx-auto mt-2 max-w-[1400px] rounded-3xl p-2 md:hidden">
          {LINKS.map((l) => (
            <li key={l.href}>
              <Link href={l.href} onClick={() => setOpen(false)} className={cn("block rounded-2xl px-4 py-3 text-sm", active(l.href) ? "bg-white/[0.08] text-star" : "text-haze")}>
                {l.label}
              </Link>
            </li>
          ))}
          <li>
            <button onClick={logout} className="block w-full rounded-2xl px-4 py-3 text-left text-sm text-haze">Sign out</button>
          </li>
        </motion.ul>
      )}
    </header>
  );
}
