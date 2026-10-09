import { route } from "@/server/http";
import * as store from "@/server/db/store";
import { ownedRun } from "@/server/run-access";
import { isLive } from "@/server/workflow/runner";

export const dynamic = "force-dynamic";
export const GET = route(async (_req, { params, session }) => {
  const { id } = await params;
  const { diff_snapshot, ...run } = await ownedRun(id, session.uid);
  const task = (await store.getTask(run.task_id))!;
  const repo = await store.getRepo(task.repo_id);
  const [tests, approvals, toolCalls] = await Promise.all([store.listTestResults(id), store.listApprovals(id), store.listToolCalls(id)]);
  return {
    run: { ...run, workspace_path: undefined, live: isLive(id), changed_files: (diff_snapshot ?? []).map((d) => ({ path: d.path, status: d.status, additions: d.additions, deletions: d.deletions })) },
    task,
    repo: repo ? { id: repo.id, kind: repo.kind, full_name: repo.full_name, default_branch: repo.default_branch } : null,
    tests,
    approvals,
    toolCalls,
  };
});
