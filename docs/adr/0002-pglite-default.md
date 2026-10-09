# ADR 0002 — PostgreSQL schema with embedded PGlite as the zero-setup default

**Decision.** All persistence is plain PostgreSQL SQL. If `DATABASE_URL` is set, `pg` is used; otherwise PGlite (Postgres in WASM) stores data in `.forgeai/pgdata`.

**Why.** Portable to macOS/Windows without Docker or a database server, while keeping one SQL dialect and real Postgres semantics (JSONB, partial indexes, LATERAL joins).

**Consequences.** PGlite is single-process: the eval runner uses its own data directory. Use real PostgreSQL for multi-process or production deployments.
