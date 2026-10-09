import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { redact } from "./redact";
import type { FileDiff } from "@/lib/types";

/**
 * Thin, hardened wrapper around the git CLI used on the host.
 *  - Repository hooks are disabled for every invocation (core.hooksPath=/dev/null), so a
 *    malicious repo cannot execute code on the host through git.
 *  - Credentials are injected as an HTTP header via GIT_CONFIG_* env vars for the single
 *    command that needs them; they are never written to .git/config or a remote URL.
 *  - Output is redacted before it is surfaced.
 */

export interface GitAuth {
  token?: string;
}

function gitEnv(auth?: GitAuth): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {
    PATH: process.env.PATH,
    HOME: process.env.HOME,
    GIT_TERMINAL_PROMPT: "0",
    GIT_CONFIG_NOSYSTEM: "1",
    GIT_ASKPASS: "echo",
    LANG: "C",
  } as unknown as NodeJS.ProcessEnv;
  for (const k of ["HTTPS_PROXY", "HTTP_PROXY", "NO_PROXY", "https_proxy", "http_proxy", "no_proxy", "SSL_CERT_FILE", "GIT_SSL_CAINFO"]) {
    if (process.env[k]) env[k] = process.env[k];
  }
  // Preserve any GIT_CONFIG_* the host already relies on (e.g. corporate proxies), then append ours.
  let count = Number(process.env.GIT_CONFIG_COUNT ?? 0) || 0;
  for (let i = 0; i < count; i++) {
    env[`GIT_CONFIG_KEY_${i}`] = process.env[`GIT_CONFIG_KEY_${i}`];
    env[`GIT_CONFIG_VALUE_${i}`] = process.env[`GIT_CONFIG_VALUE_${i}`];
  }
  if (auth?.token) {
    const basic = Buffer.from(`x-access-token:${auth.token}`).toString("base64");
    env[`GIT_CONFIG_KEY_${count}`] = "http.https://github.com/.extraheader";
    env[`GIT_CONFIG_VALUE_${count}`] = `AUTHORIZATION: basic ${basic}`;
    count++;
  }
  env.GIT_CONFIG_COUNT = String(count);
  return env;
}

export class GitError extends Error {}

export function git(args: string[], opts: { cwd?: string; auth?: GitAuth; timeoutMs?: number; maxBuffer?: number } = {}): Promise<string> {
  const full = ["-c", "core.hooksPath=/dev/null", "-c", "protocol.ext.allow=never", "-c", "core.fsmonitor=false", ...args];
  return new Promise((resolve, reject) => {
    execFile(
      "git",
      full,
      { cwd: opts.cwd, env: gitEnv(opts.auth), timeout: opts.timeoutMs ?? 120_000, maxBuffer: opts.maxBuffer ?? 32 * 1024 * 1024 },
      (err, stdout, stderr) => {
        if (err) reject(new GitError(redact(`git ${args[0]} failed: ${stderr || err.message}`).trim()));
        else resolve(stdout);
      },
    );
  });
}

export async function cloneRepo(opts: { source: string; dest: string; branch?: string; auth?: GitAuth; depth?: number }) {
  await fs.mkdir(path.dirname(opts.dest), { recursive: true });
  const args = ["clone", "--no-recurse-submodules", "--single-branch"];
  if (opts.branch) args.push("--branch", opts.branch);
  if (opts.depth && /^https?:/.test(opts.source)) args.push("--depth", String(opts.depth));
  else if (!/^https?:/.test(opts.source)) args.push("--no-hardlinks");
  args.push("--", opts.source, opts.dest);
  await git(args, { auth: opts.auth, timeoutMs: 300_000 });
  await git(["config", "user.name", "ForgeAI"], { cwd: opts.dest });
  await git(["config", "user.email", "forgeai@users.noreply.github.com"], { cwd: opts.dest });
  await git(["config", "commit.gpgsign", "false"], { cwd: opts.dest });
  return (await git(["rev-parse", "HEAD"], { cwd: opts.dest })).trim();
}

export async function createBranch(cwd: string, branch: string) {
  await git(["checkout", "-b", branch], { cwd });
}

/** Files changed relative to base (tracked + untracked), excluding ignored files. */
export async function changedFiles(cwd: string, baseSha: string) {
  await git(["add", "-A", "--intent-to-add"], { cwd }).catch(() => undefined);
  const out = await git(["diff", "--numstat", "-M", baseSha], { cwd });
  const nameStatus = await git(["diff", "--name-status", "-M", baseSha], { cwd });
  const statusByPath = new Map<string, FileDiff["status"]>();
  for (const line of nameStatus.split("\n").filter(Boolean)) {
    const [code, ...paths] = line.split("\t");
    const p = paths[paths.length - 1];
    statusByPath.set(p, code.startsWith("A") ? "added" : code.startsWith("D") ? "deleted" : code.startsWith("R") ? "renamed" : "modified");
  }
  return out
    .split("\n")
    .filter(Boolean)
    .map((line) => {
      const [a, d, ...rest] = line.split("\t");
      let p = rest.join("\t");
      const m = p.match(/\{(.*) => (.*)\}/);
      if (m) p = p.replace(m[0], m[2]);
      else if (p.includes(" => ")) p = p.split(" => ")[1];
      return { path: p, additions: a === "-" ? 0 : Number(a), deletions: d === "-" ? 0 : Number(d), status: statusByPath.get(p) ?? "modified" };
    });
}

const LANG: Record<string, string> = {
  ts: "typescript", tsx: "typescript", js: "javascript", jsx: "javascript", mjs: "javascript", cjs: "javascript", json: "json",
  py: "python", go: "go", rs: "rust", java: "java", cs: "csharp", cpp: "cpp", cc: "cpp", h: "cpp", hpp: "cpp", c: "c",
  md: "markdown", yml: "yaml", yaml: "yaml", css: "css", html: "html", sql: "sql", sh: "shell", rb: "ruby", php: "php", kt: "kotlin",
};

export async function fileDiffs(cwd: string, baseSha: string, maxBytes = 400_000): Promise<FileDiff[]> {
  const files = await changedFiles(cwd, baseSha);
  return Promise.all(
    files.map(async (f) => {
      const original = f.status === "added" ? "" : await git(["show", `${baseSha}:${f.path}`], { cwd }).catch(() => "");
      const modified = f.status === "deleted" ? "" : await fs.readFile(path.join(cwd, f.path), "utf8").catch(() => "");
      const ext = f.path.split(".").pop()?.toLowerCase() ?? "";
      return {
        ...f,
        original: original.length > maxBytes ? original.slice(0, maxBytes) + "\n…[truncated]" : original,
        modified: modified.length > maxBytes ? modified.slice(0, maxBytes) + "\n…[truncated]" : modified,
        language: LANG[ext] ?? "plaintext",
      };
    }),
  );
}

export async function unifiedDiff(cwd: string, baseSha: string, maxChars = 120_000) {
  await git(["add", "-A", "--intent-to-add"], { cwd }).catch(() => undefined);
  const d = await git(["diff", "-M", baseSha], { cwd });
  return d.length > maxChars ? d.slice(0, maxChars) + "\n…[diff truncated]" : d;
}

export async function commitAll(cwd: string, message: string) {
  await git(["add", "-A"], { cwd });
  await git(["commit", "-m", message, "--no-verify"], { cwd });
  return (await git(["rev-parse", "HEAD"], { cwd })).trim();
}

export async function pushBranch(cwd: string, branch: string, auth?: GitAuth) {
  await git(["push", "origin", `HEAD:refs/heads/${branch}`], { cwd, auth, timeoutMs: 180_000 });
}

/** Resets the working tree to a commit (used when restarting an interrupted run). */
export async function resetHard(cwd: string, sha: string) {
  await git(["reset", "--hard", sha], { cwd });
  await git(["clean", "-fd"], { cwd });
}

export async function isGitRepo(dir: string) {
  try {
    await git(["rev-parse", "--is-inside-work-tree"], { cwd: dir });
    return true;
  } catch {
    return false;
  }
}

export async function currentBranch(dir: string) {
  return (await git(["rev-parse", "--abbrev-ref", "HEAD"], { cwd: dir })).trim();
}

export async function listBranches(dir: string) {
  const out = await git(["for-each-ref", "--format=%(refname:short)", "refs/heads"], { cwd: dir });
  return out.split("\n").filter(Boolean);
}
