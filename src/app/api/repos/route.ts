import fs from "node:fs";
import path from "node:path";
import { z } from "zod";
import { route, parseBody, HttpError } from "@/server/http";
import * as store from "@/server/db/store";
import { getRepoInfo } from "@/server/github";
import { config } from "@/server/config";
import { isGitRepo, currentBranch } from "@/server/git";

export const dynamic = "force-dynamic";

export const GET = route(async (_req, { session }) => ({ repos: await store.listRepos(session.uid) }));

const Body = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("github"), fullName: z.string().regex(/^[A-Za-z0-9-_.]+\/[A-Za-z0-9-_.]+$/) }),
  z.object({ kind: z.literal("local"), path: z.string().min(1).max(1000) }),
]);

export const POST = route(async (req, { session }) => {
  const body = await parseBody(req, Body);
  if (body.kind === "github") {
    const info = await getRepoInfo(body.fullName);
    const repo = await store.createRepo(session.uid, {
      kind: "github", full_name: info.fullName, clone_url: info.cloneUrl, default_branch: info.defaultBranch, is_private: info.private,
      metadata: { description: info.description, language: info.language, canPush: info.canPush },
    });
    await store.audit({ userId: session.uid, action: "repo.connected", targetType: "repo", targetId: repo.id, details: { fullName: info.fullName } });
    return { repo };
  }
  const abs = path.resolve(body.path);
  const roots = config().localRepoRoots;
  if (!roots.some((r) => abs === r || abs.startsWith(r + path.sep))) {
    throw new HttpError(403, "not_allowed", `Local path is outside FORGEAI_LOCAL_REPO_ROOTS (${roots.join(", ") || "none configured"})`);
  }
  if (!fs.existsSync(abs) || !(await isGitRepo(abs))) throw new HttpError(422, "not_a_repo", "Path is not a git repository");
  const branch = await currentBranch(abs);
  const repo = await store.createRepo(session.uid, { kind: "local", full_name: `local/${path.basename(abs)}`, clone_url: abs, default_branch: branch, is_private: true, metadata: { path: abs } });
  await store.audit({ userId: session.uid, action: "repo.connected", targetType: "repo", targetId: repo.id, details: { path: abs } });
  return { repo };
});
