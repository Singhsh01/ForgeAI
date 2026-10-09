import { describe, expect, it } from "vitest";
import { evaluateToolCall } from "@/server/agents/policy";

const ws = "/work/run_1";
describe("tool permission policy", () => {
  it("allows reads inside the workspace", () => {
    expect(evaluateToolCall({ tool: "Read", input: { file_path: "/work/run_1/src/a.ts" }, workspace: ws, allowWrite: false }).allow).toBe(true);
    expect(evaluateToolCall({ tool: "Grep", input: { pattern: "session", path: "src" }, workspace: ws, allowWrite: false }).allow).toBe(true);
  });
  it("blocks path traversal and absolute escapes", () => {
    expect(evaluateToolCall({ tool: "Read", input: { file_path: "/etc/passwd" }, workspace: ws, allowWrite: false }).allow).toBe(false);
    expect(evaluateToolCall({ tool: "Read", input: { file_path: "../run_2/secret" }, workspace: ws, allowWrite: false }).allow).toBe(false);
    expect(evaluateToolCall({ tool: "Glob", input: { pattern: "../../**" }, workspace: ws, allowWrite: false }).allow).toBe(false);
  });
  it("never grants shell, network or sub-agents", () => {
    for (const tool of ["Bash", "WebFetch", "WebSearch", "Task", "mcp__github__create_pr"]) {
      expect(evaluateToolCall({ tool, input: {}, workspace: ws, allowWrite: true }).allow).toBe(false);
    }
  });
  it("read-only roles cannot write", () => {
    expect(evaluateToolCall({ tool: "Edit", input: { file_path: "src/a.ts" }, workspace: ws, allowWrite: false }).allow).toBe(false);
  });
  it("writers cannot touch protected paths", () => {
    for (const p of [".git/config", ".env", ".env.local", ".github/workflows/ci.yml", ".claude/settings.json", "keys/server.pem"]) {
      expect(evaluateToolCall({ tool: "Write", input: { file_path: p }, workspace: ws, allowWrite: true }).allow, p).toBe(false);
    }
    expect(evaluateToolCall({ tool: "Write", input: { file_path: "src/auth/session.ts" }, workspace: ws, allowWrite: true }).allow).toBe(true);
  });
  it("agents cannot read env files", () => {
    expect(evaluateToolCall({ tool: "Read", input: { file_path: ".env" }, workspace: ws, allowWrite: false }).allow).toBe(false);
  });
});
