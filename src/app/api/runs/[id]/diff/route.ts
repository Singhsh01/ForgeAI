import { route } from "@/server/http";
import { ownedRun } from "@/server/run-access";

export const dynamic = "force-dynamic";
export const GET = route(async (_req, { params, session }) => {
  const { id } = await params;
  const run = await ownedRun(id, session.uid);
  return { files: run.diff_snapshot ?? [], stats: run.diff_stats, base: run.base_sha, head: run.head_sha, branch: run.branch };
});
