import { parseBody, route } from "@/lib/api";
import { requireUser } from "@/lib/auth/session";
import { today, toIsoDay } from "@/lib/dates";
import { acceptRoutePlanSchema } from "@/lib/study/route-plan";
import { acceptRoutePlan, routeDraft } from "@/lib/study/route-plan-service";

/**
 * `GET /api/study/modules/[id]/plan` · Borrador (no escribe nada) de la ruta priorizada repartida en
 * bloques por día, con lo que ya hay cada día (entrenos y otros bloques) y lo que no cabe.
 *
 * - Errores: 401 sin sesión · 404 no existe **o es de otra usuaria**.
 */
export const GET = route(async (_req, ctx: RouteContext<"/api/study/modules/[id]/plan">) => {
  const user = await requireUser();
  const { id } = await ctx.params;
  return routeDraft(user.id, id, toIsoDay(today()));
});

/**
 * `POST /api/study/modules/[id]/plan` · Acepta el borrador revisado `{ blocks: [{ topicId, date, minutes }] }`:
 * sustituye solo los bloques pendientes de esta asignatura desde hoy. No toca entrenos ni otros bloques.
 *
 * - Salida: 200 `{ created, replaced }`.
 * - Errores: 400 datos no válidos, tema ajeno a la asignatura o fecha fuera de plazo · 401 · 403 origen · 404 no suya.
 */
export const POST = route(async (req, ctx: RouteContext<"/api/study/modules/[id]/plan">) => {
  const user = await requireUser();
  const { id } = await ctx.params;
  return acceptRoutePlan(user.id, id, toIsoDay(today()), await parseBody(req, acceptRoutePlanSchema));
});
