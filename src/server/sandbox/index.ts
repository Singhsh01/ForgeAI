import { spawn } from "node:child_process";
import os from "node:os";
import path from "node:path";
import fs from "node:fs";
import { randomBytes } from "node:crypto";
import { config } from "../config";
import { redact } from "../redact";

/**
 * Execution sandbox for untrusted, AI-modified code.
 *
 * docker  — default. Disposable container per command: no network for tests, dropped
 *           capabilities, no-new-privileges, read-only root fs, pid/memory/cpu limits,
 *           non-root user, only the disposable workspace is mounted. No host secrets.
 * process — explicit opt-in developer fallback. Scrubbed env + timeout + process-group kill,
 *           but NO filesystem or network isolation. Never use with untrusted repositories.
 */

export interface SandboxCommand {
  workspace: string;
  command: string;
  network: boolean;
  timeoutMs?: number;
  signal?: AbortSignal;
  onOutput?: (chunk: string) => void;
}

export interface SandboxResult {
  driver: "docker" | "process";
  exitCode: number | null;
  timedOut: boolean;
  cancelled: boolean;
  durationMs: number;
  output: string; // tail, redacted
}

const MAX_OUTPUT = 64 * 1024;

export function sandboxDescription() {
  const c = config().sandbox;
  return c.driver === "docker" ? `docker:${c.image} mem=${c.memory} cpus=${c.cpus}` : "process (UNSAFE: no isolation)";
}

export async function runInSandbox(cmd: SandboxCommand): Promise<SandboxResult> {
  const c = config().sandbox;
  const ws = path.resolve(cmd.workspace);
  if (!ws.startsWith(path.resolve(config().workspacesDir) + path.sep) && !process.env.FORGEAI_ALLOW_ANY_WORKSPACE) {
    throw new Error(`Refusing to run sandbox outside the workspaces directory: ${ws}`);
  }
  if (!fs.existsSync(ws)) throw new Error(`Workspace does not exist: ${ws}`);
  const timeoutMs = cmd.timeoutMs ?? c.timeoutMs;

  if (c.driver === "docker") {
    const name = `forgeai-${randomBytes(6).toString("hex")}`;
    const uid = typeof process.getuid === "function" ? `${process.getuid()}:${process.getgid?.()}` : "1000:1000";
    const args = [
      "run", "--rm", "--name", name,
      "--network", cmd.network ? "bridge" : "none",
      "--memory", c.memory, "--memory-swap", c.memory,
      "--cpus", c.cpus,
      "--pids-limit", "512",
      "--cap-drop", "ALL",
      "--security-opt", "no-new-privileges",
      "--read-only",
      "--tmpfs", "/tmp:rw,exec,size=1g",
      "--user", uid,
      "-e", "HOME=/tmp", "-e", "CI=1", "-e", "npm_config_cache=/tmp/.npm", "-e", "PIP_CACHE_DIR=/tmp/.pip",
      "-e", "PYTHONUSERBASE=/tmp/.local", "-e", "NO_COLOR=1",
      "-v", `${ws}:/workspace:rw`,
      "-w", "/workspace",
      c.image, "sh", "-c", cmd.command,
    ];
    return exec("docker", args, { timeoutMs, signal: cmd.signal, onOutput: cmd.onOutput, onKill: () => spawn("docker", ["kill", name]).on("error", () => undefined), driver: "docker" });
  }

  const home = fs.mkdtempSync(path.join(os.tmpdir(), "forgeai-home-"));
  try {
    return await exec("sh", ["-c", cmd.command], {
      cwd: ws,
      timeoutMs,
      signal: cmd.signal,
      onOutput: cmd.onOutput,
      driver: "process",
      detached: true,
      env: { PATH: process.env.PATH ?? "/usr/bin:/bin", HOME: home, CI: "1", LANG: "C.UTF-8", NO_COLOR: "1", ...(cmd.network ? proxyEnv() : {}) } as unknown as NodeJS.ProcessEnv,
    });
  } finally {
    fs.rmSync(home, { recursive: true, force: true });
  }
}

function proxyEnv() {
  const out: Record<string, string> = {};
  for (const k of ["HTTPS_PROXY", "HTTP_PROXY", "NO_PROXY", "https_proxy", "http_proxy", "no_proxy", "NODE_EXTRA_CA_CERTS", "SSL_CERT_FILE"]) {
    if (process.env[k]) out[k] = process.env[k]!;
  }
  return out;
}

function exec(
  bin: string,
  args: string[],
  o: { cwd?: string; env?: NodeJS.ProcessEnv; timeoutMs: number; signal?: AbortSignal; onOutput?: (s: string) => void; onKill?: () => void; driver: "docker" | "process"; detached?: boolean },
): Promise<SandboxResult> {
  return new Promise((resolve) => {
    const start = Date.now();
    let out = "";
    let timedOut = false;
    let cancelled = false;
    const child = spawn(bin, args, { cwd: o.cwd, env: o.env ?? ({ PATH: process.env.PATH, HOME: process.env.HOME, DOCKER_HOST: process.env.DOCKER_HOST } as unknown as NodeJS.ProcessEnv), detached: o.detached, stdio: ["ignore", "pipe", "pipe"] });
    const append = (b: Buffer) => {
      const s = b.toString("utf8");
      out += s;
      if (out.length > MAX_OUTPUT * 2) out = out.slice(-MAX_OUTPUT);
      o.onOutput?.(s);
    };
    child.stdout.on("data", append);
    child.stderr.on("data", append);
    const kill = () => {
      o.onKill?.();
      try {
        if (o.detached && child.pid) process.kill(-child.pid, "SIGKILL");
        else child.kill("SIGKILL");
      } catch {
        /* already gone */
      }
    };
    const timer = setTimeout(() => {
      timedOut = true;
      kill();
    }, o.timeoutMs);
    const onAbort = () => {
      cancelled = true;
      kill();
    };
    o.signal?.addEventListener("abort", onAbort, { once: true });
    const finish = (code: number | null, extra = "") => {
      clearTimeout(timer);
      o.signal?.removeEventListener("abort", onAbort);
      resolve({ driver: o.driver, exitCode: code, timedOut, cancelled, durationMs: Date.now() - start, output: redact((out + extra).slice(-MAX_OUTPUT)) });
    };
    child.on("error", (e: Error) => finish(null, `\n[sandbox] failed to start ${bin}: ${e.message}`));
    child.on("close", (code: number | null) => finish(code));
  });
}

/** Checks whether the configured sandbox can actually run. */
export async function sandboxHealth(): Promise<{ ok: boolean; detail: string }> {
  const c = config().sandbox;
  if (c.driver === "process") return { ok: true, detail: "process driver (no isolation)" };
  return new Promise((resolve) => {
    const p = spawn("docker", ["image", "inspect", c.image, "--format", "{{.Id}}"], { stdio: ["ignore", "pipe", "pipe"] });
    let err = "";
    p.stderr.on("data", (d) => (err += d));
    p.on("error", () => resolve({ ok: false, detail: "docker CLI not found" }));
    p.on("close", (code) =>
      resolve(code === 0 ? { ok: true, detail: `image ${c.image} available` } : { ok: false, detail: err.includes("No such image") ? `image ${c.image} missing — run npm run sandbox:build` : err.trim().slice(0, 200) || "docker unavailable" }),
    );
  });
}
