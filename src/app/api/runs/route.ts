import { route } from "@/server/http";
import * as store from "@/server/db/store";

export const dynamic = "force-dynamic";
export const GET = route(async (_req, { session }) => ({ runs: await store.listRuns(session.uid) }));
