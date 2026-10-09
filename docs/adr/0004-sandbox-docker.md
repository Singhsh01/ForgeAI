# ADR 0004 — Controller-driven Docker sandbox; agents have no shell

**Decision.** Agents never get Bash. The controller runs install/test/lint commands in a fresh hardened container per command. A `process` driver exists only as an explicit, documented unsafe fallback.

**Why.** Keeps execution deterministic and auditable (every command is recorded), removes the largest prompt-injection blast radius (arbitrary shell), and makes network policy enforceable (`--network none` for tests).

**Consequences.** Agents cannot run tests themselves mid-edit; feedback arrives through the verify→repair loop, which costs an extra agent call per iteration.
