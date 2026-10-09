import fs from "node:fs";
import path from "node:path";
import { route } from "@/server/http";

export const dynamic = "force-dynamic";
export const GET = route(async () => {
  const dir = path.join(process.cwd(), "eval", "reports");
  const tasksDir = path.join(process.cwd(), "eval", "tasks");
  const reports = fs.existsSync(dir)
    ? fs.readdirSync(dir).filter((f) => f.endsWith(".json")).sort().reverse().slice(0, 20).map((f) => JSON.parse(fs.readFileSync(path.join(dir, f), "utf8")))
    : [];
  const tasks = fs.existsSync(tasksDir)
    ? fs.readdirSync(tasksDir).filter((f) => f.endsWith(".json")).sort().map((f) => JSON.parse(fs.readFileSync(path.join(tasksDir, f), "utf8")))
    : [];
  return { reports, tasks: tasks.map((t) => ({ id: t.id, category: t.category, title: t.title, acceptance: t.acceptance })) };
});
