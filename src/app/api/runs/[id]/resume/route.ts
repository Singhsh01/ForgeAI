import { route } from "@/server/http";
import * as store from "@/server/db/store";
import { ownedRun } from "@/server/run-access";
import { resumeRun } from "@/server/workflow/runner";

export const POST = route(async (_req, { params, session }) => {
  const { id } = await params;
  await ownedRun(id, session.uid);
  await resumeRun(id);
  await store.audit({ userId: session.uid, action: "run.resumed", targetType: "run", targetId: id });
  return { ok: true };
});
