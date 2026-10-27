import { z } from "zod";

import { parseBody, route } from "@/lib/api";
import { requireUser } from "@/lib/auth/session";
import { applyWeekFeedback } from "@/lib/ai-plan/service";

const schema = z.object({
  week: z.number().int().min(1).max(52),
  version: z.string().min(1).max(64),
});

/**
 * `POST /api/ai-plan/[code]/feedback/apply` · Aplica al plan los cambios propuestos tras «¿Cómo fue la semana?» (una sola vez).
 * Es la confirmación explícita: nada escribe en el plan sin pasar por aquí.
 *
 * - Entrada: JSON `{ week 1–52, version }` (`version` identifica el plan que se vio al proponer).
 * - Errores: 400 · 401 · 403 origen/condiciones · 404 plan no suyo · 409 el plan cambió desde la propuesta, no hay propuesta
 *   para esa semana o ya se aplicó.
 */
export const POST = route(async (req, ctx: RouteContext<"/api/ai-plan/[code]/feedback/apply">) => {
  const user = await requireUser();
  const { code } = await ctx.params;
  const body = await parseBody(req, schema);
  return applyWeekFeedback(user.id, code, body.week, body.version);
});
