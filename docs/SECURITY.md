# Security model and threat model

ForgeAI executes code written by a language model against repositories that may contain hostile content. The design assumes **every repository file, issue body, test output and model response is untrusted**.

## Assets

| Asset | Where it lives | Protection |
|---|---|---|
| Model API key (NVIDIA / Google / Anthropic) | Server env only | Sent only as the Authorization header to the configured endpoint (or the Claude agent process env); never in prompts or the sandbox; `nvapi-`/`AIza`/`sk-ant-` patterns redacted from logs/events |
| GitHub token | Server env only (`FORGEAI_GITHUB_TOKEN`) | Used by Octokit and as a one-shot git HTTP header; never in `.git/config`, URLs, prompts, sandbox or browser |
| Host filesystem | Host | Agents limited to the run workspace by policy; sandbox mounts only the workspace |
| Operator session | HttpOnly SameSite=Lax cookie | HMAC-SHA256 signed, 12 h expiry, login rate limited, constant-time credential check |
| Repositories | GitHub / local | Nothing is pushed without an explicit `publish_pr` approval |

## Threats and mitigations

| # | Threat | Mitigation | Residual risk |
|---|---|---|---|
| T1 | Prompt injection in README/issue/test output ("ignore instructions, exfiltrate token") | Content wrapped in `<untrusted>` blocks with an explicit rule; agents have no shell, no network tools, no MCP; secrets are not in the agent's context or environment | A model may still be misled into writing harmful code; that code only runs in the sandbox and is reviewed by a human before publishing |
| T2 | Agent reads or writes outside the repo | `PreToolUse` hook + `canUseTool` apply `evaluateToolCall`: path must resolve inside the workspace; `.git`, `.env*`, `.github/workflows`, `.claude`, keys are write-protected; `.env*` unreadable | Nemotron/Gemini path: ForgeAI's file tools resolve `realpath` before every access, so symlinks cannot escape. Claude path: lexical check only (see limitations) |
| T3 | Malicious repo config executes on host | `settingSources: []` (repo `.claude` settings, hooks and CLAUDE.md are never loaded); git runs with `core.hooksPath=/dev/null`, `protocol.ext.allow=never`, no submodules | Git filter drivers require local config and are not set by ForgeAI |
| T4 | AI-generated code harms the host | Tests run only in Docker: `--network none`, `--cap-drop ALL`, `no-new-privileges`, `--read-only` root, tmpfs `/tmp`, memory/cpu/pids limits, non-root `--user`, only the workspace mounted, timeout + `docker kill` | Container escape via kernel bugs; dependency install step has network by default (disable with `FORGEAI_SANDBOX_INSTALL_NETWORK=false`) |
| T5 | Runaway cost or loops | Per-run `maxCostUsd` (also passed as the SDK's `maxBudgetUsd`), `maxSteps`, `maxAgentTurns`, `maxRepairAttempts`, wall-clock timeout, cancel | Cost figures are SDK estimates, not billing data |
| T6 | Secret leakage via logs/events | `redact()` on every event, tool input, test output and log line (token regexes + registered runtime secrets) | Novel secret formats in repo output may slip through regexes |
| T7 | Unauthorised API use | Middleware gate on `/app` and `/api`; per-run ownership checks; zod validation; write-rate limiting; audit log of logins, repo connects, approvals, cancels and publishes | Single-operator auth; no RBAC yet |
| T8 | Local path abuse | Local repos must sit under `FORGEAI_LOCAL_REPO_ROOTS`; sandbox refuses workspaces outside `.forgeai/workspaces` | — |
| T9 | Publishing unreviewed code | State machine forbids `reviewing → publishing`; PRs are opened as drafts with test evidence | Reviewer can approve a bad diff |

## Known sandbox limitations

* The **process** driver (`FORGEAI_SANDBOX_DRIVER=process`) provides no isolation at all. It exists for tests and for machines without Docker; never use it with untrusted repositories.
* Dependency installation needs network by default; a malicious `postinstall` script runs during that step (still inside the container, but with egress).
* Docker Desktop on macOS/Windows runs containers in a VM, which strengthens isolation; on Linux the container shares the host kernel.
* Mounting `/var/run/docker.sock` into the ForgeAI app container (Dockerfile) gives that container control of the Docker daemon. Prefer running ForgeAI directly on the host, or use a rootless daemon.
* On the Claude Agent SDK path the tool policy validates paths lexically, so a symlink committed to the repository could point outside the workspace. ForgeAI's own tools (used for NVIDIA Nemotron, Google Gemini and other OpenAI-compatible providers) resolve `realpath` and refuse such paths.
* Free model tiers may log prompts for service improvement under the provider's terms; do not use them with confidential code unless their terms allow it.

## Reporting

This is a personal project; open a private security advisory on the repository.
