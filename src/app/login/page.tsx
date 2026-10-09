"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { motion } from "motion/react";
import { Backdrop } from "@/components/fx/backdrop";
import { Logo } from "@/components/fx/logo";
import { Button } from "@/components/ui/button";
import { api, ApiError } from "@/lib/api";

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api("/api/auth/login", { json: { email, password } });
      const next = params.get("next");
      router.replace(next && next.startsWith("/app") ? next : "/app");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not reach the server. Check that ForgeAI is running.");
      setBusy(false);
    }
  };

  return (
    <motion.form
      onSubmit={submit}
      initial={{ opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.9, ease: [0.22, 1, 0.36, 1] }}
      className="glass w-full max-w-[420px] rounded-[var(--radius-panel)] p-8 sm:p-10"
    >
      <Logo />
      <h1 className="mt-8 font-display text-[40px] leading-none text-star">Sign in</h1>
      <p className="mt-3 text-sm text-haze">Use the operator account configured in your <code className="font-mono text-[12.5px] text-star">.env</code>.</p>
      <label className="mt-8 block text-[13px] text-haze" htmlFor="email">Email</label>
      <input
        id="email" type="email" autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value)}
        className="mt-2 h-11 w-full rounded-2xl border border-white/10 bg-white/[0.04] px-4 text-star outline-none transition-colors placeholder:text-dim focus:border-ion/60 focus:bg-white/[0.07]"
      />
      <label className="mt-5 block text-[13px] text-haze" htmlFor="password">Password</label>
      <input
        id="password" type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)}
        className="mt-2 h-11 w-full rounded-2xl border border-white/10 bg-white/[0.04] px-4 text-star outline-none transition-colors focus:border-ion/60 focus:bg-white/[0.07]"
      />
      {error && <p role="alert" className="mt-4 rounded-2xl border border-danger/30 bg-danger/10 px-4 py-3 text-sm text-danger">{error}</p>}
      <Button type="submit" variant="primary" size="lg" className="mt-8 w-full" loading={busy}>Sign in</Button>
    </motion.form>
  );
}

export default function LoginPage() {
  return (
    <>
      <Backdrop />
      <main id="main" className="grid min-h-[100svh] place-items-center px-4 py-16">
        <Suspense>
          <LoginForm />
        </Suspense>
      </main>
    </>
  );
}
