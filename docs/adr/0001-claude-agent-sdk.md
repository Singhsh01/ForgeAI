# ADR 0001 — Use the Claude Agent SDK for agents, with a thin provider seam

> Status: kept as an option; superseded as the default by ADR 0006 (NVIDIA Nemotron / Google Gemini).

**Decision.** Agents are run with `@anthropic-ai/claude-agent-sdk` `query()`, using its built-in Read/Edit/Write/Glob/Grep tools, `PreToolUse` hooks for policy, `outputFormat` JSON schemas for structured results, `maxTurns`/`maxBudgetUsd` for budgets, and `settingSources: []` to ignore repository configuration.

**Why.** The SDK already provides a robust tool loop, file editing, cost accounting and permission hooks; re-implementing these would add risk. A small `AgentProvider` interface isolates the dependency for tests (scripted provider) and future work.

**Consequences.** ForgeAI is coupled to Claude Code's tool semantics. It does not claim model portability: another provider would need equivalent file tools.
