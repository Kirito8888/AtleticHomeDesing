import { NextResponse } from "next/server";

import { route } from "@/lib/api";
import { requireUser } from "@/lib/auth/session";
import { copyCoachTemplate } from "@/lib/training/template-library";

/** v1.8 · El atleta copia a sus plantillas una plantilla compartida por su entrenadora. */
export const POST = route(async (_req, ctx: RouteContext<"/api/training/templates/[id]/copy">) => {
  const user = await requireUser();
  const { id } = await ctx.params;
  return NextResponse.json(await copyCoachTemplate(user.id, id), { status: 201 });
});
