// Applies database migrations (also done automatically at server start).
const { getDb } = await import("../src/server/db/client");
const db = await getDb();
console.log(`migrations applied (${db.kind})`);
await db.close();
export {};
