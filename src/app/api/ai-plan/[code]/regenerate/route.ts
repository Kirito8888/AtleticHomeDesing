import { NextResponse } from "next/server";

import { enforceRateLimit, route } from "@/lib/api";
import { requireUser } from "@/lib/auth/session";
import { regenerateAiPlan } from "@/lib/ai-plan/service";

/** Vuelve a generar un borrador con las mismas respuestas. */
export const POST = route(async (_req, ctx: RouteContext<"/api/ai-plan/[code]/regenerate">) => {
  const user = await requireUser();
  enforceRateLimit("aiGenerate", user.id);
  const { code } = await ctx.params;
  return NextResponse.json(await regenerateAiPlan(user.id, code), { status: 201 });
});
