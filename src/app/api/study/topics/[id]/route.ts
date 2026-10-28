import { parsePatchBody, route } from "@/lib/api";
import { requireUser } from "@/lib/auth/session";
import { deleteTopic, topicPatchSchema, updateTopic } from "@/lib/study/modules-service";

/**
 * `PATCH /api/study/topics/[id]` · Edita un tema (solo los campos enviados, `topicPatchSchema`): marcar hecho, etiqueta, minutos…
 *
 * - Salida: 200 el tema. Errores: 400 datos no válidos · 401 · 403 origen/condiciones · 404 no existe o su asignatura no es suya.
 */
export const PATCH = route(async (req, ctx: RouteContext<"/api/study/topics/[id]">) => {
  const user = await requireUser();
  const { id } = await ctx.params;
  return updateTopic(user.id, id, await parsePatchBody(req, topicPatchSchema));
});

/**
 * `DELETE /api/study/topics/[id]` · Borra un tema.
 *
 * - Salida: 200 `{ ok: true }`. Errores: 401 · 403 origen/condiciones · 404 no existe o no es suyo.
 */
export const DELETE = route(async (_req, ctx: RouteContext<"/api/study/topics/[id]">) => {
  const user = await requireUser();
  const { id } = await ctx.params;
  await deleteTopic(user.id, id);
  return { ok: true };
});
