# ADR 0006 — NVIDIA Nemotron / Google Gemini as the default model providers

**Context.** The Anthropic API is paid and separate from Claude subscriptions. The product owner wants free-tier access through NVIDIA (Nemotron on build.nvidia.com) or Google (Gemini via AI Studio).

**Decision.** Add `OpenAICompatibleProvider`, which talks to any OpenAI-style `/chat/completions` endpoint with function calling, and make it the default (`FORGEAI_LLM_PROVIDER=nvidia`). Presets:

| Provider | Base URL | Default model | Key |
|---|---|---|---|
| nvidia | `https://integrate.api.nvidia.com/v1` | `nvidia/nemotron-3-super-120b-a12b` | `NVIDIA_API_KEY` |
| google | `https://generativelanguage.googleapis.com/v1beta/openai` | `gemini-3.8-flash` | `GEMINI_API_KEY` |
| openai-compatible | `FORGEAI_LLM_BASE_URL` | `FORGEAI_MODEL` | `FORGEAI_LLM_API_KEY` |
| anthropic | Claude Agent SDK | `claude-sonnet-5-5` | `ANTHROPIC_API_KEY` |

Because these models have no built-in file tools, ForgeAI owns the agent loop and ships five tools (`list_files`, `read_file`, `search`, `edit_file`, `write_file`). Every call is checked by the same policy as before and then confined again with `realpath`, which also closes the symlink gap noted in SECURITY.md for this path. Structured output is requested in the system prompt and validated with the same Zod schemas; one corrective retry is made if the reply is not JSON. 429/5xx responses are retried with exponential backoff (honouring `Retry-After`). A token budget (`FORGEAI_MAX_TOKENS`) caps runs regardless of price.

**Consequences.** Agent quality now depends on the chosen open/Google model's tool-calling ability; this is measurable with `npm run eval`. The Claude Agent SDK path remains available (`FORGEAI_LLM_PROVIDER=anthropic`). ADR 0001 is no longer the default path.
