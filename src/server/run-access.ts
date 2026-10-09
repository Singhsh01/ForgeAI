import * as store from "./db/store";
import { HttpError } from "./http";

export async function ownedRun(runId: string, uid: string) {
  const owner = await store.runOwner(runId);
  if (!owner || owner !== uid) throw new HttpError(404, "not_found", "Run not found");
  const run = (await store.getRun(runId))!;
  return run;
}
