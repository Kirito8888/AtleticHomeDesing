import { NextResponse } from "next/server";

import { enforceRateLimit, parseBody, route } from "@/lib/api";
import { requireUser } from "@/lib/auth/session";
import { planRequestSchema } from "@/lib/ai-plan/options";
import { generateAiPlan } from "@/lib/ai-plan/service";

/** Cuestionario → plan con IA (borrador). Solo para uno mismo: el coach no genera planes ajenos. */
export const POST = route(async (req) => {
  const user = await requireUser();
  enforceRateLimit("aiGenerate", user.id);
  const request = await parseBody(req, planRequestSchema);
  return NextResponse.json(await generateAiPlan(user.id, request), { status: 201 });
});
