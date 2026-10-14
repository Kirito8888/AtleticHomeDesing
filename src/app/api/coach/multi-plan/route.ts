import { z } from "zod";

import { parseBody, route } from "@/lib/api";
import { requireUser } from "@/lib/auth/session";
import { applyAssignment, applySchema, multiPlanOverview, previewAssignment, previewSchema } from "@/lib/coach/multi-plan";

/** v2.0 B · GET: atletas (aptas o no) y orígenes · POST {action:"preview"|"apply"}: previsualiza (solo lee) o asigna (exige confirm). */
export const GET = route(async () => multiPlanOverview(await requireUser()));

export const POST = route(async (req) => {
  const user = await requireUser();
  const body = await req.json().catch(() => null);
  const action = z.object({ action: z.enum(["preview", "apply"]) }).parse(body);
  const rest = { ...(body as object) } as Record<string, unknown>;
  delete rest.action;
  const forward = new Request(req.url, { method: "POST", body: JSON.stringify(rest), headers: { "content-type": "application/json" } });
  return action.action === "preview" ? previewAssignment(user, await parseBody(forward, previewSchema)) : applyAssignment(user, await parseBody(forward, applySchema));
});
