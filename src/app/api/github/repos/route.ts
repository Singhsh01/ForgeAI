import { route } from "@/server/http";
import { listAccessibleRepos } from "@/server/github";

export const dynamic = "force-dynamic";
export const GET = route(async () => ({ repos: await listAccessibleRepos() }));
