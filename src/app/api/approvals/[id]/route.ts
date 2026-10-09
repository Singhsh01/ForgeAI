import { z } from "zod";
import { route, parseBody, HttpError } from "@/server/http";
import * as store from "@/server/db/store";
import { decide } from "@/server/workflow/runner";

const Body = z.object({ approved: z.boolean(), comment: z.string().max(2000).optional() });

export const POST = route(async (req, { params, session }) => {
  const { id } = await params;
  const body = await parseBody(req, Body);
  const ap = await store.getApproval(id);
  if (!ap || (await store.runOwner(ap.run_id)) !== session.uid) throw new HttpError(404, "not_found", "Approval not found");
  const decided = await decide(id, session.uid, body.approved, body.comment);
  return { approval: decided };
});
