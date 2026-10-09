import path from "node:path";

/**
 * Tool permission policy enforced on every tool call an agent attempts (PreToolUse hook).
 * Agents can only touch files inside their disposable workspace, never .git internals,
 * and only the tools their role grants. Shell/network tools are never granted to agents:
 * code execution happens exclusively in the sandbox, driven by the workflow controller.
 */
export const READ_TOOLS = ["Read", "Glob", "Grep"];
export const WRITE_TOOLS = ["Edit", "Write", "MultiEdit"];
export const ALWAYS_DENIED = ["Bash", "BashOutput", "KillShell", "KillBash", "WebFetch", "WebSearch", "Task", "Agent", "NotebookEdit", "TodoWrite", "Skill", "SlashCommand", "ExitPlanMode", "Monitor", "LSP"];

const PROTECTED = [/(^|\/)\.git(\/|$)/, /(^|\/)\.env(\.|$)/, /(^|\/)\.claude(\/|$)/, /(^|\/)\.mcp\.json$/, /(^|\/)\.github\/workflows\//, /\.(pem|key|p12|pfx)$/i];

export interface PolicyDecision {
  allow: boolean;
  reason?: string;
}

export function evaluateToolCall(opts: { tool: string; input: Record<string, unknown>; workspace: string; allowWrite: boolean }): PolicyDecision {
  const { tool, input, workspace, allowWrite } = opts;
  if (ALWAYS_DENIED.includes(tool) || tool.startsWith("mcp__")) return { allow: false, reason: `${tool} is not permitted for ForgeAI agents (execution happens only in the sandbox)` };
  const isRead = READ_TOOLS.includes(tool);
  const isWrite = WRITE_TOOLS.includes(tool);
  if (!isRead && !isWrite) return { allow: false, reason: `Unknown or unapproved tool: ${tool}` };
  if (isWrite && !allowWrite) return { allow: false, reason: `${tool} is not permitted for this agent (read-only role)` };

  const candidates = ["file_path", "path", "notebook_path"].map((k) => input[k]).filter((v): v is string => typeof v === "string" && v.length > 0);
  for (const p of candidates) {
    const abs = path.resolve(workspace, p);
    const root = path.resolve(workspace);
    if (abs !== root && !abs.startsWith(root + path.sep)) return { allow: false, reason: `Path escapes the workspace: ${p}` };
    const rel = path.relative(root, abs).split(path.sep).join("/");
    if (isWrite && PROTECTED.some((re) => re.test(rel))) return { allow: false, reason: `Writing to protected path is not allowed: ${rel}` };
    if (isRead && /(^|\/)\.env(\.|$)/.test(rel)) return { allow: false, reason: `Reading environment files is not allowed: ${rel}` };
  }
  if (tool === "Glob" || tool === "Grep") {
    const pattern = String(input.pattern ?? "");
    if (pattern.startsWith("/") || pattern.includes("..")) return { allow: false, reason: "Search patterns must be relative to the workspace" };
  }
  return { allow: true };
}
