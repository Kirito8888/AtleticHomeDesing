import { ApiError, parsePatchBody, route } from "@/lib/api";
import { requireUser } from "@/lib/auth/session";
import { dateOnly } from "@/lib/dates";
import { prisma } from "@/lib/prisma";
import { supplementPatchSchema } from "@/lib/recovery/health-admin";

/** Marcar como comprobado en la lista oficial, darlo por terminado o anotar. */
export const PATCH = route(async (req, ctx: RouteContext<"/api/recovery/supplements/[id]">) => {
  const user = await requireUser();
  const { id } = await ctx.params;
  const p = await parsePatchBody(req, supplementPatchSchema);
  const data = {
    ...("checkedOn" in p ? { checkedOn: p.checkedOn ? dateOnly(p.checkedOn) : null } : {}),
    ...("endedOn" in p ? { endedOn: p.endedOn ? dateOnly(p.endedOn) : null } : {}),
    ...("notes" in p ? { notes: p.notes } : {}),
  };
  const { count } = await prisma.supplement.updateMany({ where: { id, userId: user.id }, data });
  if (!count) throw new ApiError(404, "Suplemento no encontrado");
  return { ok: true };
});

export const DELETE = route(async (_req, ctx: RouteContext<"/api/recovery/supplements/[id]">) => {
  const user = await requireUser();
  const { id } = await ctx.params;
  const { count } = await prisma.supplement.deleteMany({ where: { id, userId: user.id } });
  if (!count) throw new ApiError(404, "Suplemento no encontrado");
  return { ok: true };
});
