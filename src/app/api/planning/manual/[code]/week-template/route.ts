import { z } from "zod";

import { parseBody, route } from "@/lib/api";
import { requireUser } from "@/lib/auth/session";
import { applyWeekTemplate, saveWeekTemplate, weekTemplateSchema } from "@/lib/planning/manual-plan";

/** Semanas tipo del plan propio: POST guarda la semana `week` con un nombre · PUT aplica una a la semana `week`. */
export const POST = route(async (req, ctx: RouteContext<"/api/planning/manual/[code]/week-template">) => {
  const user = await requireUser();
  const { code } = await ctx.params;
  return saveWeekTemplate(user.id, decodeURIComponent(code), await parseBody(req, weekTemplateSchema));
});

export const PUT = route(async (req, ctx: RouteContext<"/api/planning/manual/[code]/week-template">) => {
  const user = await requireUser();
  const { code } = await ctx.params;
  const { week, templateId } = await parseBody(req, z.object({ week: z.number().int().min(1).max(60), templateId: z.string().max(40) }));
  return applyWeekTemplate(user.id, decodeURIComponent(code), week, templateId);
});
