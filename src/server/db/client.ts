import fs from "node:fs";
import path from "node:path";
import { config } from "../config";
import { logger } from "../logger";

export interface Db {
  query<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<T[]>;
  exec(sql: string): Promise<void>;
  transaction<T>(fn: (tx: Pick<Db, "query">) => Promise<T>): Promise<T>;
  close(): Promise<void>;
  kind: "pglite" | "postgres";
}

async function createPglite(dataDir: string): Promise<Db> {
  const { PGlite } = await import("@electric-sql/pglite");
  fs.mkdirSync(dataDir, { recursive: true });
  const pg = await PGlite.create(dataDir);
  return {
    kind: "pglite",
    async query(sql, params) {
      const r = await pg.query(sql, params as unknown[] | undefined);
      return r.rows as never;
    },
    async exec(sql) {
      await pg.exec(sql);
    },
    async transaction(fn) {
      return pg.transaction(async (tx) =>
        fn({ query: async (sql, params) => (await tx.query(sql, params as unknown[] | undefined)).rows as never }),
      );
    },
    async close() {
      await pg.close();
    },
  };
}

async function createPostgres(url: string): Promise<Db> {
  const { Pool } = (await import("pg")).default;
  const pool = new Pool({ connectionString: url, max: 10 });
  return {
    kind: "postgres",
    async query(sql, params) {
      return (await pool.query(sql, params as unknown[] | undefined)).rows as never;
    },
    async exec(sql) {
      await pool.query(sql);
    },
    async transaction(fn) {
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        const out = await fn({ query: async (sql, params) => (await client.query(sql, params as unknown[] | undefined)).rows as never });
        await client.query("COMMIT");
        return out;
      } catch (e) {
        await client.query("ROLLBACK");
        throw e;
      } finally {
        client.release();
      }
    },
    async close() {
      await pool.end();
    },
  };
}

export async function migrate(db: Db, dir = path.join(process.cwd(), "db", "migrations")) {
  await db.exec(`CREATE TABLE IF NOT EXISTS schema_migrations (name TEXT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT now())`);
  const applied = new Set((await db.query<{ name: string }>("SELECT name FROM schema_migrations")).map((r) => r.name));
  const files = fs.readdirSync(dir).filter((f) => f.endsWith(".sql")).sort();
  for (const f of files) {
    if (applied.has(f)) continue;
    const sql = fs.readFileSync(path.join(dir, f), "utf8");
    await db.exec(sql);
    await db.query("INSERT INTO schema_migrations (name) VALUES ($1)", [f]);
    logger.info({ migration: f }, "applied migration");
  }
}

const g = globalThis as unknown as { __forgeaiDb?: Promise<Db> };

/** Process-wide singleton (survives Next.js dev hot reloads). */
export function getDb(): Promise<Db> {
  g.__forgeaiDb ??= (async () => {
    const c = config();
    const db = c.databaseUrl ? await createPostgres(c.databaseUrl) : await createPglite(path.join(c.dataDir, "pgdata"));
    await migrate(db);
    logger.info({ kind: db.kind }, "database ready");
    return db;
  })().catch((e) => {
    g.__forgeaiDb = undefined;
    throw e;
  });
  return g.__forgeaiDb;
}

/** For tests: create an isolated in-memory database. */
export async function createMemoryDb(): Promise<Db> {
  const { PGlite } = await import("@electric-sql/pglite");
  const pg = await PGlite.create();
  const db: Db = {
    kind: "pglite",
    query: async (sql, params) => (await pg.query(sql, params as unknown[] | undefined)).rows as never,
    exec: async (sql) => void (await pg.exec(sql)),
    transaction: (fn) => pg.transaction((tx) => fn({ query: async (s, p) => (await tx.query(s, p as unknown[] | undefined)).rows as never })),
    close: () => pg.close(),
  };
  await migrate(db);
  return db;
}
