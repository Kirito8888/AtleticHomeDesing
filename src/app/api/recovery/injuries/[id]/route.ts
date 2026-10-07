import { parsePatchBody, route } from "@/lib/api";
import { requireUser } from "@/lib/auth/session";
import { deleteInjury, injuryUpdateSchema, updateInjury } from "@/lib/recovery/injuries";

type Ctx = RouteContext<"/api/recovery/injuries/[id]">;

/** Editar o dar de alta ({resolvedOn}). */
export const PATCH = route(async (req, ctx: Ctx) => {
  const user = await requireUser();
  const { id } = await ctx.params;
  return updateInjury(user.id, id, await parsePatchBody(req, injuryUpdateSchema));
});

export const DELETE = route(async (_req, ctx: Ctx) => {
  const user = await requireUser();
  const { id } = await ctx.params;
  await deleteInjury(user.id, id);
  return { ok: true };
});
