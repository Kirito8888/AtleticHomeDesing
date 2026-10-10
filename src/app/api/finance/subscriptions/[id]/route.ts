import { parsePatchBody, route } from "@/lib/api";
import { requireUser } from "@/lib/auth/session";
import { today, toIsoDay } from "@/lib/dates";
import { subscriptionPatchSchema, updateSubscription } from "@/lib/finance/season-service";

/** v1.7 · Cambiar importe, próxima fecha o pausar. Un cambio de importe queda registrado (aviso si sube). */
export const PATCH = route(async (req, ctx: RouteContext<"/api/finance/subscriptions/[id]">) => {
  const user = await requireUser();
  const { id } = await ctx.params;
  await updateSubscription(user.id, id, await parsePatchBody(req, subscriptionPatchSchema), toIsoDay(today()));
  return { ok: true };
});
