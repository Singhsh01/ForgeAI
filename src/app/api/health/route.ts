import { route } from "@/server/http";
import { getDb } from "@/server/db/client";

export const dynamic = "force-dynamic";
export const GET = route(async () => {
  const db = await getDb();
  await db.query("SELECT 1");
  return { ok: true, db: db.kind, time: new Date().toISOString() };
}, { public: true });
