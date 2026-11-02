import { parseBody, route } from "@/lib/api";
import { requireUser } from "@/lib/auth/session";
import { parseFormat, examFormatSchema } from "@/lib/study/exam-format";
import { requireModule } from "@/lib/study/modules-service";
import { prisma } from "@/lib/prisma";

/**
 * `GET /api/study/modules/[id]/exam-format` · Formato de examen de la asignatura (`examFormat`) y si ya se respondió (`set`).
 * Errores: 401 · 404 no suya.
 */
export const GET = route(async (_req, ctx: RouteContext<"/api/study/modules/[id]/exam-format">) => {
  const user = await requireUser();
  const { id } = await ctx.params;
  const m = await requireModule(user.id, id);
  return { examFormat: parseFormat(m.examFormat), set: m.examFormat !== null };
});

/**
 * `PUT /api/study/modules/[id]/exam-format` · Fija cómo es el examen (test/desarrollo × teórico/práctico, pesos, minutos, preguntas).
 * Cambia el reparto de los exámenes y de los paquetes que se generen **a partir de ahora**; los ya generados no se tocan.
 *
 * - Entrada: JSON `examFormatSchema`. Salida: 200 `{ examFormat, set: true }`.
 * - Errores: 400 combinación no válida o pesos que no suman 100 · 401 · 403 origen/condiciones · 404 no suya.
 */
export const PUT = route(async (req, ctx: RouteContext<"/api/study/modules/[id]/exam-format">) => {
  const user = await requireUser();
  const { id } = await ctx.params;
  await requireModule(user.id, id);
  const f = await parseBody(req, examFormatSchema);
  await prisma.studyModule.update({ where: { id }, data: { examFormat: f } });
  return { examFormat: f, set: true };
});
