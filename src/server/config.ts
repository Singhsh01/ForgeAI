import path from "node:path";
import { z } from "zod";

const bool = (def: "true" | "false") =>
  z
    .string()
    .default(def)
    .transform((v) => v.toLowerCase() === "true" || v === "1");

const EnvSchema = z.object({
  FORGEAI_ADMIN_EMAIL: z.string().email().default("operator@forgeai.local"),
  FORGEAI_ADMIN_PASSWORD: z.string().optional(),
  FORGEAI_SESSION_SECRET: z.string().optional(),
  // Model provider: nvidia (Nemotron via build.nvidia.com), google (Gemini via AI Studio),
  // openai-compatible (any other OpenAI-style endpoint) or anthropic (Claude Agent SDK).
  FORGEAI_LLM_PROVIDER: z.enum(["nvidia", "google", "openai-compatible", "anthropic"]).default("nvidia"),
  NVIDIA_API_KEY: z.string().optional(),
  GEMINI_API_KEY: z.string().optional(),
  GOOGLE_API_KEY: z.string().optional(),
  FORGEAI_LLM_API_KEY: z.string().optional(),
  FORGEAI_LLM_BASE_URL: z.string().url().optional(),
  FORGEAI_LLM_EXTRA_BODY: z.string().optional(),
  FORGEAI_PRICE_INPUT_PER_MTOK: z.coerce.number().min(0).default(0),
  FORGEAI_PRICE_OUTPUT_PER_MTOK: z.coerce.number().min(0).default(0),
  ANTHROPIC_API_KEY: z.string().optional(),
  FORGEAI_MODEL: z.string().optional(),
  FORGEAI_MAX_TOKENS: z.coerce.number().int().positive().default(3_000_000),
  FORGEAI_MAX_COST_USD: z.coerce.number().positive().default(3),
  FORGEAI_MAX_REPAIR_ATTEMPTS: z.coerce.number().int().min(0).max(5).default(2),
  FORGEAI_MAX_AGENT_TURNS: z.coerce.number().int().min(1).max(200).default(40),
  FORGEAI_MAX_STEPS: z.coerce.number().int().min(10).max(2000).default(400),
  FORGEAI_RUN_TIMEOUT_MS: z.coerce.number().int().positive().default(30 * 60_000),
  FORGEAI_GITHUB_TOKEN: z.string().optional(),
  DATABASE_URL: z.string().optional(),
  FORGEAI_DATA_DIR: z.string().default(path.join(process.cwd(), ".forgeai")),
  FORGEAI_SANDBOX_DRIVER: z.enum(["docker", "process"]).default("docker"),
  FORGEAI_SANDBOX_IMAGE: z.string().default("forgeai-sandbox:latest"),
  FORGEAI_SANDBOX_MEMORY: z.string().default("2g"),
  FORGEAI_SANDBOX_CPUS: z.string().default("2"),
  FORGEAI_SANDBOX_TIMEOUT_MS: z.coerce.number().int().positive().default(10 * 60_000),
  FORGEAI_SANDBOX_INSTALL_NETWORK: bool("true"),
  FORGEAI_LOCAL_REPO_ROOTS: z.string().optional(),
  OTEL_EXPORTER_OTLP_ENDPOINT: z.string().optional(),
});

export type AppConfig = ReturnType<typeof loadConfig>;

export const PROVIDER_DEFAULTS = {
  nvidia: { baseUrl: "https://integrate.api.nvidia.com/v1", model: "nvidia/nemotron-3-super-120b-a12b", label: "NVIDIA Nemotron", extraBody: { chat_template_kwargs: { force_nonempty_content: true } } },
  google: { baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai", model: "gemini-3.8-flash", label: "Google Gemini", extraBody: {} },
  "openai-compatible": { baseUrl: "", model: "", label: "OpenAI-compatible", extraBody: {} },
  anthropic: { baseUrl: "", model: "claude-sonnet-5-5", label: "Anthropic Claude", extraBody: {} },
} as const;

export type LlmProvider = keyof typeof PROVIDER_DEFAULTS;

function loadConfig() {
  const env = EnvSchema.parse(process.env);
  const provider = env.FORGEAI_LLM_PROVIDER;
  const def = PROVIDER_DEFAULTS[provider];
  // A Claude model id left over from an older .env makes no sense for other providers.
  const model = env.FORGEAI_MODEL && !(provider !== "anthropic" && /^claude/i.test(env.FORGEAI_MODEL)) ? env.FORGEAI_MODEL : def.model;
  const apiKey =
    provider === "nvidia" ? env.NVIDIA_API_KEY ?? env.FORGEAI_LLM_API_KEY
    : provider === "google" ? env.GEMINI_API_KEY ?? env.GOOGLE_API_KEY ?? env.FORGEAI_LLM_API_KEY
    : provider === "anthropic" ? env.ANTHROPIC_API_KEY
    : env.FORGEAI_LLM_API_KEY;
  let extraBody: Record<string, unknown> = { ...def.extraBody };
  if (env.FORGEAI_LLM_EXTRA_BODY) {
    try {
      extraBody = { ...extraBody, ...JSON.parse(env.FORGEAI_LLM_EXTRA_BODY) };
    } catch {
      throw new Error("FORGEAI_LLM_EXTRA_BODY must be a JSON object");
    }
  }
  const dataDir = path.resolve(env.FORGEAI_DATA_DIR);
  return {
    adminEmail: env.FORGEAI_ADMIN_EMAIL,
    adminPassword: env.FORGEAI_ADMIN_PASSWORD,
    sessionSecret: env.FORGEAI_SESSION_SECRET,
    anthropicKey: env.ANTHROPIC_API_KEY,
    model,
    llm: {
      provider,
      label: def.label,
      apiKey,
      baseUrl: (env.FORGEAI_LLM_BASE_URL ?? def.baseUrl).replace(/\/+$/, ""),
      model,
      extraBody,
      priceInputPerMTok: env.FORGEAI_PRICE_INPUT_PER_MTOK,
      priceOutputPerMTok: env.FORGEAI_PRICE_OUTPUT_PER_MTOK,
    },
    budget: {
      maxTokens: env.FORGEAI_MAX_TOKENS,
      maxCostUsd: env.FORGEAI_MAX_COST_USD,
      maxRepairAttempts: env.FORGEAI_MAX_REPAIR_ATTEMPTS,
      maxAgentTurns: env.FORGEAI_MAX_AGENT_TURNS,
      maxSteps: env.FORGEAI_MAX_STEPS,
      timeoutMs: env.FORGEAI_RUN_TIMEOUT_MS,
    },
    githubToken: env.FORGEAI_GITHUB_TOKEN,
    databaseUrl: env.DATABASE_URL,
    dataDir,
    workspacesDir: path.join(dataDir, "workspaces"),
    sandbox: {
      driver: env.FORGEAI_SANDBOX_DRIVER,
      image: env.FORGEAI_SANDBOX_IMAGE,
      memory: env.FORGEAI_SANDBOX_MEMORY,
      cpus: env.FORGEAI_SANDBOX_CPUS,
      timeoutMs: env.FORGEAI_SANDBOX_TIMEOUT_MS,
      installNetwork: env.FORGEAI_SANDBOX_INSTALL_NETWORK,
    },
    localRepoRoots: (env.FORGEAI_LOCAL_REPO_ROOTS ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean)
      .map((p) => path.resolve(p)),
    otlpEndpoint: env.OTEL_EXPORTER_OTLP_ENDPOINT || undefined,
  };
}

let cached: AppConfig | undefined;
export function config(): AppConfig {
  cached ??= loadConfig();
  return cached;
}

/** Non-secret capability summary safe to send to the browser. */
export function capabilities() {
  const c = config();
  const llmReady = Boolean(c.llm.apiKey) && (c.llm.provider === "anthropic" || Boolean(c.llm.baseUrl && c.llm.model));
  return {
    llm: { provider: c.llm.provider, label: c.llm.label, model: c.llm.model, ready: llmReady, baseUrl: c.llm.baseUrl || null },
    github: Boolean(c.githubToken),
    database: c.databaseUrl ? "postgres" : "pglite",
    sandbox: c.sandbox.driver,
    sandboxImage: c.sandbox.image,
    model: c.model,
    localRepoRoots: c.localRepoRoots.length,
    otlp: Boolean(c.otlpEndpoint),
    budget: c.budget,
  };
}
