import { getPack } from "@/lib/ai/study-pack";
import { route } from "@/lib/api";
import { requireUser } from "@/lib/auth/session";

/**
 * `GET /api/ai/study/pack/[topicId]` · Estado del paquete de un tema: `status` (PENDING · RUNNING · READY · PARTIAL · FAILED),
 * avance (`meta.done/total`), partes que fallaron, y el resumen validado (`summary`) cuando existe. Sin paquete: `{ pack: null }`.
 *
 * - Errores: 401 · 404 tema no suyo (o de otra usuaria: misma respuesta).
 */
export const GET = route(async (_req, ctx: RouteContext<"/api/ai/study/pack/[topicId]">) => {
  const user = await requireUser();
  const { topicId } = await ctx.params;
  return { pack: await getPack(user.id, topicId) };
});
