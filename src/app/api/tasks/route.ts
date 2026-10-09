import { z } from "zod";
import { route, parseBody, HttpError } from "@/server/http";
import * as store from "@/server/db/store";
import { getIssue } from "@/server/github";
import { startRun } from "@/server/workflow/runner";

export const dynamic = "force-dynamic";

export const GET = route(async (req, { session }) => {
  const repoId = req.nextUrl.searchParams.get("repoId") ?? undefined;
  return { tasks: await store.listTasks(session.uid, repoId) };
});

const Body = z.object({
  repoId: z.string().min(1),
  title: z.string().trim().min(3).max(200).optional(),
  description: z.string().trim().max(20_000).default(""),
  issueNumber: z.number().int().positive().optional(),
  requirePlanApproval: z.boolean().default(false),
});

export const POST = route(async (req, { session }) => {
  const body = await parseBody(req, Body);
  const repo = await store.getRepo(body.repoId);
  if (!repo || repo.user_id !== session.uid) throw new HttpError(404, "not_found", "Repository not found");
  let title = body.title;
  let description = body.description;
  let issueUrl: string | null = null;
  if (body.issueNumber) {
    if (repo.kind !== "github") throw new HttpError(422, "validation_failed", "Issues are only available for GitHub repositories");
    const issue = await getIssue(repo.full_name, body.issueNumber);
    title ??= issue.title;
    issueUrl = issue.url;
    description = description || `Resolve GitHub issue #${issue.number}: ${issue.title}`;
  }
  if (!title) throw new HttpError(422, "validation_failed", "A title or an issue is required");
  if (!description) description = title;
  const task = await store.createTask(session.uid, {
    repo_id: repo.id, title, description, source: body.issueNumber ? "issue" : "freeform", issue_number: body.issueNumber ?? null, issue_url: issueUrl, require_plan_approval: body.requirePlanApproval,
  });
  const run = await startRun(task.id);
  await store.audit({ userId: session.uid, action: "task.created", targetType: "task", targetId: task.id, details: { runId: run.id, repo: repo.full_name } });
  return { task, run };
});
