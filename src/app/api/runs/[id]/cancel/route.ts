import { route } from "@/server/http";
import * as store from "@/server/db/store";
import { ownedRun } from "@/server/run-access";
import { cancelRun } from "@/server/workflow/runner";

export const POST = route(async (_req, { params, session }) => {
  const { id } = await params;
  await ownedRun(id, session.uid);
  const ok = await cancelRun(id);
  await store.audit({ userId: session.uid, action: "run.cancelled", targetType: "run", targetId: id });
  return { ok };
});
