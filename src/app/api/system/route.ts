import { route } from "@/server/http";
import { capabilities } from "@/server/config";
import { sandboxHealth } from "@/server/sandbox";
import { viewer } from "@/server/github";

export const dynamic = "force-dynamic";
export const GET = route(async () => {
  const caps = capabilities();
  const [sandbox, gh] = await Promise.all([
    sandboxHealth(),
    caps.github ? viewer().then((v) => ({ ok: true as const, login: v.login })).catch((e: Error) => ({ ok: false as const, error: e.message })) : Promise.resolve(null),
  ]);
  return { ...caps, sandboxHealth: sandbox, githubViewer: gh };
});
