import { z } from "zod";

import { ApiError, parseBody, parseQuery, route } from "@/lib/api";
import { requireUser } from "@/lib/auth/session";
import { createManualPlan, manualPlanSchema } from "@/lib/planning/manual-plan";
import { prisma } from "@/lib/prisma";
import { toIsoDay } from "@/lib/dates";

/** Crea un plan propio vacío (borrador) con los días de la semana elegidos. */
export const POST = route(async (req) => {
  const user = await requireUser();
  return createManualPlan(user.id, await parseBody(req, manualPlanSchema));
});

/** Días de un plan propio (solo lectura): id, fecha y título. */
export const GET = route(async (req) => {
  const user = await requireUser();
  const { code } = parseQuery(req, z.object({ code: z.string().max(20) }));
  const meso = await prisma.planMeso.findUnique({ where: { userId_code: { userId: user.id, code } }, select: { source: true, days: { orderBy: { date: "asc" }, select: { id: true, date: true, title: true } } } });
  if (!meso || meso.source !== "MANUAL") throw new ApiError(404, "Plan no encontrado");
  return { days: meso.days.map((d) => ({ id: d.id, title: d.title, date: d.date ? toIsoDay(d.date) : null })) };
});
