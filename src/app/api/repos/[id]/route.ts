import { route, HttpError } from "@/server/http";
import * as store from "@/server/db/store";

export const DELETE = route(async (_req, { params, session }) => {
  const { id } = await params;
  const repo = await store.getRepo(id);
  if (!repo || repo.user_id !== session.uid) throw new HttpError(404, "not_found", "Repository not found");
  await store.deleteRepo(id, session.uid);
  await store.audit({ userId: session.uid, action: "repo.disconnected", targetType: "repo", targetId: id });
  return { ok: true };
});
