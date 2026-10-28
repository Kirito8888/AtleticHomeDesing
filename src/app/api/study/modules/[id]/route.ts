import { parsePatchBody, route } from "@/lib/api";
import { requireUser } from "@/lib/auth/session";
import { today, toIsoDay } from "@/lib/dates";
import { deleteModule, moduleView, updateModule } from "@/lib/study/modules-service";
import { moduleSchema } from "@/lib/study/study-route";

/**
 * `GET /api/study/modules/[id]` · Asignatura con sus temas; con el modo preparación activo, `route` trae el temario completo
 * reordenado por prioridad (`prioritize`).
 *
 * - Errores: 401 sin sesión · 404 no existe **o es de otra usuaria** (misma respuesta, no se revela).
 */
export const GET = route(async (_req, ctx: RouteContext<"/api/study/modules/[id]">) => {
  const user = await requireUser();
  const { id } = await ctx.params;
  return moduleView(user.id, id, toIsoDay(today()));
});

/**
 * `PATCH /api/study/modules/[id]` · Edita solo los campos enviados (`moduleSchema` parcial).
 *
 * - Salida: 200 la vista actualizada de la asignatura.
 * - Errores: 400 datos no válidos · 401 · 403 origen/condiciones · 404 no suya · 409 nombre repetido.
 */
export const PATCH = route(async (req, ctx: RouteContext<"/api/study/modules/[id]">) => {
  const user = await requireUser();
  const { id } = await ctx.params;
  await updateModule(user.id, id, await parsePatchBody(req, moduleSchema.partial()));
  return moduleView(user.id, id, toIsoDay(today()));
});

/**
 * `DELETE /api/study/modules/[id]` · Borra la asignatura y sus temas; los apuntes quedan sin asignatura.
 *
 * - Salida: 200 `{ ok: true }`. Errores: 401 · 403 origen/condiciones · 404 no suya.
 */
export const DELETE = route(async (_req, ctx: RouteContext<"/api/study/modules/[id]">) => {
  const user = await requireUser();
  const { id } = await ctx.params;
  await deleteModule(user.id, id);
  return { ok: true };
});
