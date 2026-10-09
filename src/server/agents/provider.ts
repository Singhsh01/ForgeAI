import type { AgentName } from "@/lib/types";
import { ALWAYS_DENIED, evaluateToolCall, READ_TOOLS, WRITE_TOOLS } from "./policy";
import { config } from "../config";
import { registerSecret } from "../redact";

/**
 * Model-provider seam. ForgeAI's agents are written against `AgentProvider`. Two
 * implementations exist:
 *  - OpenAICompatibleProvider (default): NVIDIA Nemotron, Google Gemini or any OpenAI-style
 *    endpoint with function calling. ForgeAI runs the tool loop and provides its own file tools.
 *  - ClaudeAgentSdkProvider: Claude via the Agent SDK and Claude Code's built-in file tools.
 * Both go through the same tool policy, budgets and structured-output validation.
 */

export interface AgentUsage {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  costUsd: number;
  turns: number;
}

export interface AgentSpec {
  agent: AgentName;
  systemPrompt: string;
  prompt: string;
  cwd: string;
  write: boolean;
  tools?: boolean; // false = no tools at all (pure reasoning over provided context)
  maxTurns: number;
  maxBudgetUsd: number;
  outputSchema?: Record<string, unknown>;
  signal: AbortSignal;
  onToolCall?: (e: { tool: string; input: Record<string, unknown>; allowed: boolean; reason?: string }) => Promise<void> | void;
  onText?: (text: string) => Promise<void> | void;
}

export interface AgentResult {
  ok: boolean;
  text: string;
  structured: unknown;
  usage: AgentUsage;
  stopReason: string;
  error?: string;
}

export interface AgentProvider {
  readonly name: string;
  run(spec: AgentSpec): Promise<AgentResult>;
}

const KEY_HINT: Record<string, string> = {
  nvidia: "NVIDIA_API_KEY is not configured. Create a free key at build.nvidia.com and add it to .env to enable the agents.",
  google: "GEMINI_API_KEY is not configured. Create a free key in Google AI Studio and add it to .env to enable the agents.",
  "openai-compatible": "FORGEAI_LLM_BASE_URL, FORGEAI_LLM_API_KEY and FORGEAI_MODEL must be set in .env to enable the agents.",
  anthropic: "ANTHROPIC_API_KEY is not configured. Add it to .env to enable the agents.",
};

export class ProviderNotConfigured extends Error {
  constructor(provider = "anthropic") {
    super(KEY_HINT[provider] ?? KEY_HINT["openai-compatible"]);
  }
}

export class ClaudeAgentSdkProvider implements AgentProvider {
  readonly name = "claude-agent-sdk";

  async run(spec: AgentSpec): Promise<AgentResult> {
    const cfg = config();
    if (!cfg.anthropicKey) throw new ProviderNotConfigured("anthropic");
    registerSecret(cfg.anthropicKey);
    const { query } = await import("@anthropic-ai/claude-agent-sdk");

    const tools = spec.tools === false ? [] : spec.write ? [...READ_TOOLS, ...WRITE_TOOLS] : [...READ_TOOLS];
    const abort = new AbortController();
    const onAbort = () => abort.abort();
    spec.signal.addEventListener("abort", onAbort, { once: true });

    // Minimal environment for the agent process: API key and proxy only. No GitHub token,
    // no database URL, no other host secrets.
    const env: Record<string, string | undefined> = {
      PATH: process.env.PATH,
      HOME: process.env.HOME,
      ANTHROPIC_API_KEY: cfg.anthropicKey,
      ANTHROPIC_BASE_URL: process.env.FORGEAI_ANTHROPIC_BASE_URL,
      HTTPS_PROXY: process.env.HTTPS_PROXY,
      NO_PROXY: process.env.NO_PROXY,
      NODE_EXTRA_CA_CERTS: process.env.NODE_EXTRA_CA_CERTS,
      CLAUDE_AGENT_SDK_CLIENT_APP: "forgeai/0.1.0",
      DISABLE_AUTOUPDATER: "1",
      DISABLE_TELEMETRY: "1",
    };

    let text = "";
    let structured: unknown = null;
    const usage: AgentUsage = { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, costUsd: 0, turns: 0 };
    let stopReason = "unknown";
    let ok = false;
    let error: string | undefined;

    try {
      const q = query({
        prompt: spec.prompt,
        options: {
          cwd: spec.cwd,
          model: cfg.model,
          systemPrompt: spec.systemPrompt,
          tools,
          allowedTools: [],
          disallowedTools: ALWAYS_DENIED,
          permissionMode: "default",
          settingSources: [], // never load the (untrusted) repository's .claude settings, hooks or CLAUDE.md
          maxTurns: spec.maxTurns,
          maxBudgetUsd: spec.maxBudgetUsd,
          abortController: abort,
          env,
          ...(spec.outputSchema ? { outputFormat: { type: "json_schema" as const, schema: spec.outputSchema } } : {}),
          hooks: {
            PreToolUse: [
              {
                hooks: [
                  async (input) => {
                    const i = input as { tool_name: string; tool_input: unknown };
                    const toolInput = (i.tool_input ?? {}) as Record<string, unknown>;
                    const d = evaluateToolCall({ tool: i.tool_name, input: toolInput, workspace: spec.cwd, allowWrite: spec.write });
                    await spec.onToolCall?.({ tool: i.tool_name, input: toolInput, allowed: d.allow, reason: d.reason });
                    return {
                      hookSpecificOutput: {
                        hookEventName: "PreToolUse" as const,
                        permissionDecision: d.allow ? ("allow" as const) : ("deny" as const),
                        permissionDecisionReason: d.reason ?? "Allowed by ForgeAI policy",
                      },
                    };
                  },
                ],
              },
            ],
          },
          // Fallback: anything that still asks for permission is decided by the same policy.
          canUseTool: async (toolName, input) => {
            const d = evaluateToolCall({ tool: toolName, input, workspace: spec.cwd, allowWrite: spec.write });
            return d.allow ? { behavior: "allow", updatedInput: input } : { behavior: "deny", message: d.reason ?? "Denied by ForgeAI policy" };
          },
        },
      });

      for await (const msg of q) {
        if (msg.type === "assistant") {
          for (const block of msg.message.content) {
            if (block.type === "text" && block.text.trim()) {
              text += block.text + "\n";
              await spec.onText?.(block.text);
            }
          }
        } else if (msg.type === "result") {
          usage.turns = msg.num_turns;
          usage.costUsd = msg.total_cost_usd ?? 0;
          const mu = Object.values(msg.modelUsage ?? {});
          if (mu.length) {
            usage.inputTokens = mu.reduce((s, m) => s + m.inputTokens + m.cacheCreationInputTokens, 0);
            usage.outputTokens = mu.reduce((s, m) => s + m.outputTokens, 0);
            usage.cacheReadTokens = mu.reduce((s, m) => s + m.cacheReadInputTokens, 0);
          } else {
            usage.inputTokens = msg.usage?.input_tokens ?? 0;
            usage.outputTokens = msg.usage?.output_tokens ?? 0;
          }
          stopReason = msg.subtype;
          if (msg.subtype === "success") {
            ok = !msg.is_error;
            if (msg.result) text = msg.result;
            structured = (msg as { structured_output?: unknown }).structured_output ?? null;
            if (msg.is_error) error = msg.result;
          } else {
            error = `Agent stopped: ${msg.subtype}`;
          }
        }
      }
    } catch (e) {
      error = spec.signal.aborted ? "cancelled" : (e as Error).message;
      stopReason = spec.signal.aborted ? "cancelled" : "exception";
    } finally {
      spec.signal.removeEventListener("abort", onAbort);
    }
    return { ok, text: text.trim(), structured, usage, stopReason, error };
  }
}

let provider: AgentProvider | undefined;
export function getProvider(): AgentProvider {
  if (provider) return provider;
  if (config().llm.provider === "anthropic") return (provider = new ClaudeAgentSdkProvider());
  // Resolved per call so a key added to .env is picked up after a restart, and a missing key
  // fails the run with a clear message instead of crashing at startup.
  return { name: config().llm.provider, run: async (spec) => (await import("./openai-compatible")).OpenAICompatibleProvider.fromConfig().run(spec) };
}
/** Test seam only. */
export function setProvider(p: AgentProvider | undefined) {
  provider = p;
}
