/**
 * Protocol tests for the OpenAI-compatible provider (NVIDIA Nemotron / Google Gemini).
 * A local HTTP server plays the model and returns OpenAI-format chat completions with tool
 * calls; the provider's tool loop, file tools, policy enforcement, retries and JSON handling
 * run for real against a temporary workspace.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import http from "node:http";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import type { AddressInfo } from "node:net";
import { OpenAICompatibleProvider, extractJson } from "@/server/agents/openai-compatible";
import { globToRegExp } from "@/server/agents/workspace-tools";
import type { AgentSpec } from "@/server/agents/provider";

type Req = { headers: http.IncomingHttpHeaders; body: { model: string; messages: { role: string; content: string; tool_call_id?: string }[]; tools?: { function: { name: string } }[]; [k: string]: unknown } };
let handler: (req: Req, n: number) => { status?: number; headers?: Record<string, string>; json: unknown };
const seen: Req[] = [];
let server: http.Server;
let base = "";
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "oaic-"));
const ws = path.join(tmp, "ws");

const toolCall = (id: string, name: string, args: unknown) => ({ id, type: "function", function: { name, arguments: JSON.stringify(args) } });
const reply = (message: unknown, usage = { prompt_tokens: 100, completion_tokens: 20 }) => ({ json: { choices: [{ message, finish_reason: "stop" }], usage } });
const lastTool = (r: Req) => r.body.messages.filter((m) => m.role === "tool").at(-1)?.content ?? "";

beforeAll(async () => {
  fs.cpSync(path.resolve(__dirname, "../eval/fixtures/toolkit"), ws, { recursive: true });
  execFileSync("git", ["init", "-q"], { cwd: ws });
  fs.mkdirSync(path.join(tmp, "outside"));
  fs.writeFileSync(path.join(tmp, "outside", "secret.txt"), "TOP-SECRET");
  fs.symlinkSync(path.join(tmp, "outside"), path.join(ws, "linked"));
  server = http.createServer((req, res) => {
    let data = "";
    req.on("data", (c) => (data += c));
    req.on("end", () => {
      const r: Req = { headers: req.headers, body: JSON.parse(data) };
      seen.push(r);
      const out = handler(r, seen.length);
      res.writeHead(out.status ?? 200, { "content-type": "application/json", ...(out.headers ?? {}) });
      res.end(JSON.stringify(out.json));
    });
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", () => r()));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/v1`;
});
afterAll(() => {
  server.close();
  fs.rmSync(tmp, { recursive: true, force: true });
});

function provider(extra: Partial<ConstructorParameters<typeof OpenAICompatibleProvider>[0]> = {}) {
  return new OpenAICompatibleProvider({ baseUrl: base, apiKey: "nvapi-test-key-123456", model: "nvidia/nemotron-3-super-120b-a12b", extraBody: { chat_template_kwargs: { force_nonempty_content: true } }, priceInputPerMTok: 1, priceOutputPerMTok: 2, retryBaseMs: 5, ...extra });
}
function spec(over: Partial<AgentSpec> = {}) {
  const calls: { tool: string; allowed: boolean; reason?: string }[] = [];
  const s: AgentSpec = {
    agent: "coder", systemPrompt: "You are a test agent.", prompt: "Fix the bug.", cwd: ws, write: true, maxTurns: 10, maxBudgetUsd: 1,
    outputSchema: { type: "object", properties: { summary: { type: "string" } }, required: ["summary"] },
    signal: new AbortController().signal, onToolCall: (e) => void calls.push({ tool: e.tool, allowed: e.allowed, reason: e.reason }), ...over,
  };
  return { s, calls };
}

describe("OpenAI-compatible provider", () => {
  it("runs a tool loop that reads and edits files, then parses the JSON answer", async () => {
    seen.length = 0;
    handler = (r, n) => {
      if (n === 1) return reply({ role: "assistant", content: "Looking around.", tool_calls: [toolCall("a", "list_files", { glob: "src/**/*.js" })] });
      if (n === 2) {
        expect(lastTool(r)).toContain("src/auth/session.js");
        return reply({ role: "assistant", content: null, tool_calls: [toolCall("b", "search", { pattern: "isSessionValid", glob: "src/**" }), toolCall("c", "read_file", { path: "src/auth/session.js" })] });
      }
      if (n === 3) {
        expect(r.body.messages.filter((m) => m.role === "tool").map((m) => m.tool_call_id)).toEqual(["a", "b", "c"]);
        return reply({ role: "assistant", content: "", tool_calls: [toolCall("d", "edit_file", { path: "src/auth/session.js", old_string: "return Boolean(session && session.token);", new_string: "return Boolean(session && session.token) && session.expiresAt > now;" })] });
      }
      expect(lastTool(r)).toMatch(/Edited src\/auth\/session.js/);
      return reply({ role: "assistant", content: '```json\n{"summary":"fixed expiry"}\n```' });
    };
    const { s, calls } = spec();
    const out = await provider().run(s);
    expect(out.ok).toBe(true);
    expect(out.structured).toEqual({ summary: "fixed expiry" });
    expect(out.usage).toMatchObject({ inputTokens: 400, outputTokens: 80, turns: 4 });
    expect(out.usage.costUsd).toBeCloseTo((400 * 1 + 80 * 2) / 1e6, 10);
    expect(fs.readFileSync(path.join(ws, "src/auth/session.js"), "utf8")).toContain("session.expiresAt > now");
    expect(calls.map((c) => c.tool)).toEqual(["Glob", "Grep", "Read", "Edit"]);
    // request shape
    expect(seen[0].headers.authorization).toBe("Bearer nvapi-test-key-123456");
    expect(seen[0].body.model).toBe("nvidia/nemotron-3-super-120b-a12b");
    expect(seen[0].body.chat_template_kwargs).toEqual({ force_nonempty_content: true });
    expect(seen[0].body.tools?.map((t) => t.function.name)).toEqual(["list_files", "read_file", "search", "edit_file", "write_file"]);
    expect(seen[0].body.messages[0].content).toContain("JSON Schema");
  });

  it("enforces the policy: traversal, protected paths, symlink escapes, read-only roles", async () => {
    handler = (r, n) => {
      if (n === 1) return reply({ role: "assistant", content: null, tool_calls: [
        toolCall("1", "read_file", { path: "../outside/secret.txt" }),
        toolCall("2", "write_file", { path: ".git/hooks/pre-commit", content: "rm -rf /" }),
        toolCall("3", "read_file", { path: "linked/secret.txt" }),
        toolCall("4", "read_file", { path: ".env" }),
        toolCall("5", "bash", { command: "cat /etc/passwd" }),
      ] });
      const tools = r.body.messages.filter((m) => m.role === "tool").map((m) => m.content);
      expect(tools.join("\n")).not.toContain("TOP-SECRET");
      return reply({ role: "assistant", content: '{"summary":"done"}' });
    };
    seen.length = 0;
    const { s, calls } = spec();
    const out = await provider().run(s);
    expect(out.ok).toBe(true);
    const toolMsgs = seen[1].body.messages.filter((m) => m.role === "tool").map((m) => m.content);
    expect(toolMsgs[0]).toMatch(/Denied by ForgeAI policy: Path escapes/);
    expect(toolMsgs[1]).toMatch(/Denied by ForgeAI policy: Writing to protected path/);
    expect(toolMsgs[2]).toMatch(/resolves outside the workspace/);
    expect(toolMsgs[3]).toMatch(/Denied by ForgeAI policy: Reading environment files/);
    expect(toolMsgs[4]).toMatch(/unknown tool/);
    expect(calls.filter((c) => !c.allowed).length).toBe(4);
    expect(fs.existsSync(path.join(ws, ".git/hooks/pre-commit"))).toBe(false);

    // read-only agents are not even offered write tools, and are denied if they try
    seen.length = 0;
    handler = (_r, n) => (n === 1 ? reply({ role: "assistant", content: null, tool_calls: [toolCall("w", "write_file", { path: "x.js", content: "x" })] }) : reply({ role: "assistant", content: '{"summary":"ok"}' }));
    const ro = spec({ write: false, agent: "planner" });
    await provider().run(ro.s);
    expect(seen[0].body.tools?.map((t) => t.function.name)).toEqual(["list_files", "read_file", "search"]);
    expect(ro.calls[0]).toMatchObject({ tool: "Write", allowed: false });
    expect(fs.existsSync(path.join(ws, "x.js"))).toBe(false);
  });

  it("retries rate limits and server errors, then succeeds", async () => {
    seen.length = 0;
    handler = (_r, n) => (n === 1 ? { status: 429, headers: { "retry-after": "0" }, json: { error: { message: "rate limited" } } } : n === 2 ? { status: 503, json: {} } : reply({ role: "assistant", content: '{"summary":"after retry"}' }));
    const out = await provider().run(spec().s);
    expect(out.ok).toBe(true);
    expect(seen.length).toBe(3);
  });

  it("asks again when the final answer is not JSON", async () => {
    seen.length = 0;
    handler = (_r, n) => (n === 1 ? reply({ role: "assistant", content: "I fixed it, all good!" }) : reply({ role: "assistant", content: '{"summary":"now as json"}' }));
    const out = await provider().run(spec().s);
    expect(out.structured).toEqual({ summary: "now as json" });
    expect(seen[1].body.messages.at(-1)?.content).toMatch(/not a valid JSON object/);
  });

  it("surfaces auth errors clearly and does not retry them", async () => {
    seen.length = 0;
    handler = () => ({ status: 401, json: { error: { message: "Invalid API key" } } });
    const out = await provider().run(spec().s);
    expect(out.ok).toBe(false);
    expect(out.error).toMatch(/API error 401: Invalid API key/);
    expect(seen.length).toBe(1);
  });

  it("stops at the turn limit and at the cost budget", async () => {
    handler = () => reply({ role: "assistant", content: null, tool_calls: [toolCall("x", "list_files", {})] });
    const turns = await provider().run(spec({ maxTurns: 3 }).s);
    expect(turns).toMatchObject({ ok: false, stopReason: "error_max_turns" });
    const cost = await provider({ priceInputPerMTok: 1_000_000 }).run(spec({ maxBudgetUsd: 150 }).s);
    expect(cost).toMatchObject({ ok: false, stopReason: "error_max_budget_usd" });
  });
});

describe("helpers", () => {
  it("extracts JSON from raw, fenced and embedded replies", () => {
    expect(extractJson('{"a":1}')).toEqual({ a: 1 });
    expect(extractJson('Here:\n```json\n{"a":2}\n```')).toEqual({ a: 2 });
    expect(extractJson('Result {"a":3} done')).toEqual({ a: 3 });
    expect(extractJson("no json")).toBeUndefined();
  });
  it("matches globs", () => {
    expect(globToRegExp("src/**/*.js").test("src/auth/session.js")).toBe(true);
    expect(globToRegExp("src/**/*.js").test("src/money.js")).toBe(true);
    expect(globToRegExp("*.{ts,js}").test("a.ts")).toBe(true);
    expect(globToRegExp("*.js").test("src/a.js")).toBe(false);
  });
});
