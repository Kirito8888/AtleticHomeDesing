import { parseBody, route } from "@/lib/api";
import { requireUser } from "@/lib/auth/session";
import { allWeeksSchema, applyAllWeeks, previewAllWeeks } from "@/lib/planning/manual-plan";

/**
 * `POST /api/planning/manual/day/[id]/all-weeks` · Lleva los cambios de ciertas filas a las demás semanas (mismo día de la semana).
 * `dryRun: true` solo devuelve la vista previa y su huella; `dryRun: false` escribe (borrador + aceptar) y exige esa huella.
 * Errores: 400 · 401 · 403 · 404 día no suyo o no editable · 409 el plan cambió desde la vista previa.
 */
export const POST = route(async (req, ctx: RouteContext<"/api/planning/manual/day/[id]/all-weeks">) => {
  const user = await requireUser();
  const { id } = await ctx.params;
  const body = await parseBody(req, allWeeksSchema);
  return body.dryRun ? previewAllWeeks(user.id, id, body) : applyAllWeeks(user.id, id, body);
});
