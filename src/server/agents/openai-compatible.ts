import type { AgentProvider, AgentResult, AgentSpec, AgentUsage } from "./provider";
import { ProviderNotConfigured } from "./provider";
import { evaluateToolCall } from "./policy";
import { POLICY_NAME, policyInput, runTool, toolDefinitions, ToolError, type ToolName } from "./workspace-tools";
import { config } from "../config";
import { registerSecret } from "../redact";
import { logger } from "../logger";

/**
 * Agent loop for any OpenAI-compatible chat-completions endpoint with function calling:
 * NVIDIA NIM (Nemotron), Google Gemini's OpenAI compatibility layer, or a self-hosted server.
 *
 * ForgeAI owns the loop here: it sends the conversation, executes the requested file tools
 * locally after the policy check, feeds results back, and stops on a final answer, the turn
 * limit or the cost budget. Structured output is requested in the system prompt and parsed
 * from the final message; one corrective retry is made when the JSON is missing.
 */

type Msg =
  | { role: "system" | "user"; content: string }
  | { role: "assistant"; content: string | null; tool_calls?: ToolCall[] }
  | { role: "tool"; tool_call_id: string; content: string };
type ToolCall = { id: string; type: "function"; function: { name: string; arguments: string } };

interface ChatResponse {
  choices?: { message?: { content?: string | null; reasoning_content?: string | null; tool_calls?: ToolCall[] }; finish_reason?: string }[];
  usage?: { prompt_tokens?: number; completion_tokens?: number; prompt_tokens_details?: { cached_tokens?: number } };
  error?: { message?: string };
}

const RETRYABLE = new Set([408, 409, 425, 429, 500, 502, 503, 504]);
const sleep = (ms: number, signal: AbortSignal) =>
  new Promise<void>((res, rej) => {
    const t = setTimeout(res, ms);
    signal.addEventListener("abort", () => (clearTimeout(t), rej(new Error("cancelled"))), { once: true });
  });

export interface OpenAICompatibleOptions {
  baseUrl: string;
  apiKey: string;
  model: string;
  extraBody?: Record<string, unknown>;
  priceInputPerMTok?: number;
  priceOutputPerMTok?: number;
  name?: string;
  maxRetries?: number;
  retryBaseMs?: number;
  requestTimeoutMs?: number;
  fetchImpl?: typeof fetch;
}

export class OpenAICompatibleProvider implements AgentProvider {
  readonly name: string;
  constructor(private readonly o: OpenAICompatibleOptions) {
    this.name = o.name ?? "openai-compatible";
    registerSecret(o.apiKey);
  }

  static fromConfig(): OpenAICompatibleProvider {
    const { llm } = config();
    if (!llm.apiKey || !llm.baseUrl || !llm.model) throw new ProviderNotConfigured(llm.provider);
    return new OpenAICompatibleProvider({
      baseUrl: llm.baseUrl, apiKey: llm.apiKey, model: llm.model, extraBody: llm.extraBody,
      priceInputPerMTok: llm.priceInputPerMTok, priceOutputPerMTok: llm.priceOutputPerMTok, name: llm.provider,
    });
  }

  private async complete(body: Record<string, unknown>, signal: AbortSignal): Promise<ChatResponse> {
    const f = this.o.fetchImpl ?? fetch;
    const maxRetries = this.o.maxRetries ?? 6;
    for (let attempt = 0; ; attempt++) {
      const ctl = new AbortController();
      const onAbort = () => ctl.abort();
      signal.addEventListener("abort", onAbort, { once: true });
      const timer = setTimeout(() => ctl.abort(), this.o.requestTimeoutMs ?? 180_000);
      try {
        const res = await f(`${this.o.baseUrl}/chat/completions`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${this.o.apiKey}`, Accept: "application/json" },
          body: JSON.stringify(body),
          signal: ctl.signal,
        });
        const text = await res.text();
        if (res.ok) return JSON.parse(text) as ChatResponse;
        const retryable = RETRYABLE.has(res.status) && attempt < maxRetries;
        if (!retryable) {
          let msg = text.slice(0, 600);
          try {
            const j = JSON.parse(text);
            msg = j?.error?.message ?? j?.detail ?? j?.message ?? msg;
          } catch {
            /* keep raw */
          }
          throw new Error(`${this.name} API error ${res.status}: ${typeof msg === "string" ? msg : JSON.stringify(msg)}`);
        }
        const retryAfter = Number(res.headers.get("retry-after"));
        const wait = Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : (this.o.retryBaseMs ?? 2000) * 2 ** attempt;
        logger.warn({ provider: this.name, status: res.status, attempt, waitMs: wait }, "model API busy; retrying");
        await sleep(Math.min(wait, 60_000), signal);
      } catch (e) {
        if (signal.aborted) throw new Error("cancelled");
        const msg = (e as Error).message;
        if (/API error \d+/.test(msg) || attempt >= maxRetries) throw e;
        await sleep((this.o.retryBaseMs ?? 2000) * 2 ** attempt, signal);
      } finally {
        clearTimeout(timer);
        signal.removeEventListener("abort", onAbort);
      }
    }
  }

  async run(spec: AgentSpec): Promise<AgentResult> {
    const usage: AgentUsage = { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, costUsd: 0, turns: 0 };
    const tools = spec.tools === false ? [] : toolDefinitions(spec.write);
    const schemaNote = spec.outputSchema
      ? `\n\nWhen you are finished, reply with ONLY a JSON object (no prose, no markdown fences) that matches this JSON Schema:\n${JSON.stringify(spec.outputSchema)}`
      : "";
    const toolNote = tools.length
      ? `\n\nYou work through tools: ${tools.map((t) => t.function.name).join(", ")}. Paths are relative to the repository root. Call tools as many times as you need, then give your final answer.`
      : "";
    const messages: Msg[] = [
      { role: "system", content: spec.systemPrompt + toolNote + schemaNote },
      { role: "user", content: spec.prompt },
    ];
    let jsonRetries = 0;
    let lastText = "";

    try {
      while (usage.turns < spec.maxTurns) {
        if (spec.signal.aborted) return this.result(false, lastText, null, usage, "cancelled", "cancelled");
        usage.turns++;
        const res = await this.complete(
          {
            model: this.o.model,
            messages,
            ...(tools.length ? { tools, tool_choice: "auto" } : {}),
            temperature: 0.2,
            max_tokens: 8192,
            ...this.o.extraBody,
          },
          spec.signal,
        );
        const pIn = res.usage?.prompt_tokens ?? 0;
        const pOut = res.usage?.completion_tokens ?? 0;
        usage.inputTokens += pIn;
        usage.outputTokens += pOut;
        usage.cacheReadTokens += res.usage?.prompt_tokens_details?.cached_tokens ?? 0;
        usage.costUsd += (pIn * (this.o.priceInputPerMTok ?? 0) + pOut * (this.o.priceOutputPerMTok ?? 0)) / 1_000_000;
        if (usage.costUsd > spec.maxBudgetUsd) return this.result(false, lastText, null, usage, "error_max_budget_usd", `Cost budget of $${spec.maxBudgetUsd.toFixed(2)} exceeded`);

        const msg = res.choices?.[0]?.message;
        if (!msg) throw new Error(`${this.name} returned no message${res.error?.message ? `: ${res.error.message}` : ""}`);
        const content = (msg.content ?? "").trim();
        const calls = msg.tool_calls ?? [];
        if (content) {
          lastText = content;
          await spec.onText?.(content);
        }
        messages.push({ role: "assistant", content: msg.content ?? "", ...(calls.length ? { tool_calls: calls } : {}) });

        if (calls.length) {
          for (const call of calls) messages.push({ role: "tool", tool_call_id: call.id, content: await this.execute(call, spec) });
          continue;
        }

        if (!spec.outputSchema) return this.result(true, content, null, usage, "success");
        const parsed = extractJson(content);
        if (parsed !== undefined) return this.result(true, content, parsed, usage, "success");
        if (jsonRetries++ >= 2) return this.result(false, content, null, usage, "error_max_structured_output_retries", "The model did not return valid JSON");
        messages.push({ role: "user", content: "Your last reply was not a valid JSON object. Reply again with ONLY the JSON object that matches the schema — no explanation, no code fences." });
      }
      return this.result(false, lastText, null, usage, "error_max_turns", `Agent stopped after ${spec.maxTurns} turns without a final answer`);
    } catch (e) {
      const cancelled = spec.signal.aborted;
      return this.result(false, lastText, null, usage, cancelled ? "cancelled" : "exception", cancelled ? "cancelled" : (e as Error).message);
    }
  }

  private async execute(call: ToolCall, spec: AgentSpec): Promise<string> {
    const name = call.function?.name as ToolName;
    let args: Record<string, unknown> = {};
    try {
      args = call.function.arguments ? JSON.parse(call.function.arguments) : {};
    } catch {
      await spec.onToolCall?.({ tool: String(name), input: { raw: call.function?.arguments }, allowed: false, reason: "Malformed tool arguments" });
      return "Error: tool arguments were not valid JSON. Retry with a valid JSON object.";
    }
    const policyName = POLICY_NAME[name];
    if (!policyName || spec.tools === false) {
      await spec.onToolCall?.({ tool: String(name), input: args, allowed: false, reason: `Unknown tool ${name}` });
      return `Error: unknown tool "${name}". Available: ${toolDefinitions(spec.write).map((t) => t.function.name).join(", ")}`;
    }
    const decision = evaluateToolCall({ tool: policyName, input: policyInput(name, args, spec.cwd), workspace: spec.cwd, allowWrite: spec.write });
    const shownInput = { ...args, ...(typeof args.path === "string" ? { file_path: args.path } : {}) };
    await spec.onToolCall?.({ tool: policyName, input: shownInput, allowed: decision.allow, reason: decision.reason });
    if (!decision.allow) return `Denied by ForgeAI policy: ${decision.reason}`;
    try {
      return await runTool(name, args, spec.cwd);
    } catch (e) {
      return `Error: ${e instanceof ToolError ? e.message : (e as Error).message}`;
    }
  }

  private result(ok: boolean, text: string, structured: unknown, usage: AgentUsage, stopReason: string, error?: string): AgentResult {
    return { ok, text, structured, usage, stopReason, error };
  }
}

/** Finds a JSON object in model output (raw, fenced, or embedded in prose). */
export function extractJson(text: string): unknown | undefined {
  const tries: string[] = [text.trim()];
  for (const m of text.matchAll(/```(?:json)?\s*([\s\S]*?)```/g)) tries.push(m[1]);
  const first = text.indexOf("{");
  const last = text.lastIndexOf("}");
  if (first !== -1 && last > first) tries.push(text.slice(first, last + 1));
  for (const t of tries) {
    try {
      const v = JSON.parse(t);
      if (v && typeof v === "object") return v;
    } catch {
      /* next */
    }
  }
  return undefined;
}
