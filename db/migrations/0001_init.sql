-- ForgeAI initial schema. Applied by src/server/db/migrate.ts (idempotent, tracked in schema_migrations).

CREATE TABLE IF NOT EXISTS users (
  id            TEXT PRIMARY KEY,
  email         TEXT NOT NULL UNIQUE,
  display_name  TEXT NOT NULL,
  role          TEXT NOT NULL DEFAULT 'operator' CHECK (role IN ('admin','operator','viewer')),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS repo_connections (
  id             TEXT PRIMARY KEY,
  user_id        TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind           TEXT NOT NULL CHECK (kind IN ('github','local')),
  full_name      TEXT NOT NULL,           -- owner/repo or local display name
  clone_url      TEXT NOT NULL,           -- https URL or absolute local path
  default_branch TEXT NOT NULL DEFAULT 'main',
  is_private     BOOLEAN NOT NULL DEFAULT false,
  metadata       JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, kind, full_name)
);

CREATE TABLE IF NOT EXISTS tasks (
  id                     TEXT PRIMARY KEY,
  repo_id                TEXT NOT NULL REFERENCES repo_connections(id) ON DELETE CASCADE,
  user_id                TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title                  TEXT NOT NULL,
  description            TEXT NOT NULL,
  source                 TEXT NOT NULL CHECK (source IN ('issue','freeform','eval')),
  issue_number           INTEGER,
  issue_url              TEXT,
  require_plan_approval  BOOLEAN NOT NULL DEFAULT false,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS tasks_repo_idx ON tasks (repo_id, created_at DESC);

CREATE TABLE IF NOT EXISTS agent_runs (
  id                TEXT PRIMARY KEY,
  task_id           TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  status            TEXT NOT NULL,          -- see src/server/workflow/states.ts
  phase             TEXT NOT NULL,
  active_agent      TEXT,
  branch            TEXT,
  base_sha          TEXT,
  head_sha          TEXT,
  workspace_path    TEXT,
  trace_id          TEXT NOT NULL,
  model             TEXT NOT NULL,
  context_strategy  TEXT,
  plan              JSONB,
  review            JSONB,
  diff_stats        JSONB,
  diff_snapshot     JSONB,
  project           JSONB,
  repair_attempts   INTEGER NOT NULL DEFAULT 0,
  steps             INTEGER NOT NULL DEFAULT 0,
  input_tokens      BIGINT NOT NULL DEFAULT 0,
  output_tokens     BIGINT NOT NULL DEFAULT 0,
  cache_read_tokens BIGINT NOT NULL DEFAULT 0,
  cost_usd          NUMERIC(12,6) NOT NULL DEFAULT 0,
  error             TEXT,
  pr_url            TEXT,
  pr_number         INTEGER,
  budget            JSONB NOT NULL,
  started_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at       TIMESTAMPTZ,
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS agent_runs_task_idx   ON agent_runs (task_id, started_at DESC);
CREATE INDEX IF NOT EXISTS agent_runs_status_idx ON agent_runs (status);
CREATE INDEX IF NOT EXISTS agent_runs_started_idx ON agent_runs (started_at DESC);

CREATE TABLE IF NOT EXISTS execution_events (
  id          BIGSERIAL PRIMARY KEY,
  run_id      TEXT NOT NULL REFERENCES agent_runs(id) ON DELETE CASCADE,
  seq         INTEGER NOT NULL,
  type        TEXT NOT NULL,      -- phase | log | agent_message | tool_call | test | error | approval | budget
  agent       TEXT,
  level       TEXT NOT NULL DEFAULT 'info',
  message     TEXT NOT NULL,
  data        JSONB,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (run_id, seq)
);
CREATE INDEX IF NOT EXISTS execution_events_run_idx ON execution_events (run_id, seq);

CREATE TABLE IF NOT EXISTS tool_calls (
  id           TEXT PRIMARY KEY,
  run_id       TEXT NOT NULL REFERENCES agent_runs(id) ON DELETE CASCADE,
  agent        TEXT NOT NULL,
  tool_name    TEXT NOT NULL,
  input        JSONB,
  decision     TEXT NOT NULL CHECK (decision IN ('allowed','denied')),
  deny_reason  TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS tool_calls_run_idx ON tool_calls (run_id, created_at);
CREATE INDEX IF NOT EXISTS tool_calls_name_idx ON tool_calls (tool_name);

CREATE TABLE IF NOT EXISTS test_results (
  id           TEXT PRIMARY KEY,
  run_id       TEXT NOT NULL REFERENCES agent_runs(id) ON DELETE CASCADE,
  attempt      INTEGER NOT NULL,
  kind         TEXT NOT NULL CHECK (kind IN ('install','test','lint','build')),
  command      TEXT NOT NULL,
  sandbox      TEXT NOT NULL,
  exit_code    INTEGER,
  passed       BOOLEAN NOT NULL,
  timed_out    BOOLEAN NOT NULL DEFAULT false,
  duration_ms  INTEGER NOT NULL,
  summary      JSONB,
  output_tail  TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS test_results_run_idx ON test_results (run_id, attempt);

CREATE TABLE IF NOT EXISTS approval_requests (
  id           TEXT PRIMARY KEY,
  run_id       TEXT NOT NULL REFERENCES agent_runs(id) ON DELETE CASCADE,
  kind         TEXT NOT NULL CHECK (kind IN ('plan','publish_pr')),
  status       TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected','expired')),
  summary      TEXT NOT NULL,
  payload      JSONB,
  decided_by   TEXT REFERENCES users(id),
  decided_at   TIMESTAMPTZ,
  comment      TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS approval_requests_pending_idx ON approval_requests (status, created_at) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS approval_requests_run_idx ON approval_requests (run_id);

CREATE TABLE IF NOT EXISTS evaluation_results (
  id                 TEXT PRIMARY KEY,
  suite_run_id       TEXT NOT NULL,
  task_key           TEXT NOT NULL,
  category           TEXT NOT NULL,
  run_id             TEXT REFERENCES agent_runs(id) ON DELETE SET NULL,
  completed          BOOLEAN NOT NULL,
  hidden_tests_passed INTEGER NOT NULL DEFAULT 0,
  hidden_tests_total  INTEGER NOT NULL DEFAULT 0,
  unrelated_files    INTEGER NOT NULL DEFAULT 0,
  repair_iterations  INTEGER NOT NULL DEFAULT 0,
  tool_failures      INTEGER NOT NULL DEFAULT 0,
  duration_ms        INTEGER NOT NULL DEFAULT 0,
  tokens             BIGINT NOT NULL DEFAULT 0,
  cost_usd           NUMERIC(12,6) NOT NULL DEFAULT 0,
  details            JSONB,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS evaluation_results_suite_idx ON evaluation_results (suite_run_id);

CREATE TABLE IF NOT EXISTS audit_events (
  id          BIGSERIAL PRIMARY KEY,
  user_id     TEXT REFERENCES users(id) ON DELETE SET NULL,
  action      TEXT NOT NULL,
  target_type TEXT,
  target_id   TEXT,
  ip          TEXT,
  details     JSONB,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS audit_events_created_idx ON audit_events (created_at DESC);
CREATE INDEX IF NOT EXISTS audit_events_target_idx ON audit_events (target_type, target_id);
