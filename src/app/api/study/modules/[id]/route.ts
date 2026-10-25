import { parsePatchBody, route } from "@/lib/api";
import { requireUser } from "@/lib/auth/session";
import { today, toIsoDay } from "@/lib/dates";
import { deleteModule, moduleView, updateModule } from "@/lib/study/modules-service";
import { moduleSchema } from "@/lib/study/study-route";

/** Asignatura con sus temas; con el modo preparación activo, `route` trae el temario completo reordenado. */
export const GET = route(async (_req, ctx: RouteContext<"/api/study/modules/[id]">) => {
  const user = await requireUser();
  const { id } = await ctx.params;
  return moduleView(user.id, id, toIsoDay(today()));
});

export const PATCH = route(async (req, ctx: RouteContext<"/api/study/modules/[id]">) => {
  const user = await requireUser();
  const { id } = await ctx.params;
  await updateModule(user.id, id, await parsePatchBody(req, moduleSchema.partial()));
  return moduleView(user.id, id, toIsoDay(today()));
});

export const DELETE = route(async (_req, ctx: RouteContext<"/api/study/modules/[id]">) => {
  const user = await requireUser();
  const { id } = await ctx.params;
  await deleteModule(user.id, id);
  return { ok: true };
});
