# ADR 0003 — In-process bounded queue instead of Redis

**Decision.** Runs execute in the server process through a bounded queue (`FORGEAI_MAX_CONCURRENT_RUNS`, default 2). Durable state is in the database; restarts mark in-flight runs `interrupted` and they can be resumed.

**Why.** A single-node local tool does not justify Redis/BullMQ. The controller is already restartable from checkpoints.

**Consequences.** Horizontal scaling requires moving the runner to a separate worker with a shared queue (Redis/BullMQ or Postgres `SKIP LOCKED`). The runner module is the only place that would change.
