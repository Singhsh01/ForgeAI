import { route, HttpError } from "@/server/http";
import * as store from "@/server/db/store";
import { listRemoteBranches } from "@/server/github";
import { listBranches } from "@/server/git";

export const dynamic = "force-dynamic";
export const GET = route(async (_req, { params, session }) => {
  const { id } = await params;
  const repo = await store.getRepo(id);
  if (!repo || repo.user_id !== session.uid) throw new HttpError(404, "not_found", "Repository not found");
  const branches = repo.kind === "github" ? await listRemoteBranches(repo.full_name) : await listBranches(repo.clone_url);
  return { branches };
});
