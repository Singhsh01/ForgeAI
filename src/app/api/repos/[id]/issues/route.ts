import { route, HttpError } from "@/server/http";
import * as store from "@/server/db/store";
import { listIssues } from "@/server/github";

export const dynamic = "force-dynamic";
export const GET = route(async (_req, { params, session }) => {
  const { id } = await params;
  const repo = await store.getRepo(id);
  if (!repo || repo.user_id !== session.uid) throw new HttpError(404, "not_found", "Repository not found");
  if (repo.kind !== "github") return { issues: [] };
  return { issues: await listIssues(repo.full_name) };
});
