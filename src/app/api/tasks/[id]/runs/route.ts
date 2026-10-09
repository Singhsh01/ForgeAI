import { route, HttpError } from "@/server/http";
import * as store from "@/server/db/store";
import { startRun } from "@/server/workflow/runner";

export const POST = route(async (_req, { params, session }) => {
  const { id } = await params;
  const task = await store.getTask(id);
  if (!task || task.user_id !== session.uid) throw new HttpError(404, "not_found", "Task not found");
  const run = await startRun(task.id);
  await store.audit({ userId: session.uid, action: "run.started", targetType: "run", targetId: run.id });
  return { run };
});
