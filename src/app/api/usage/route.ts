import { NextResponse } from "next/server";
import { z } from "zod";

import { recordPageView, usageSummary } from "@/lib/admin/usage";
import { route } from "@/lib/api";
import { requireUser } from "@/lib/auth/session";

/** v1.8 · Uso local de la app (solo en esta instalación; desactivable en Ajustes). */
export const GET = route(async () => {
  const user = await requireUser();
  return usageSummary(user.id);
});

export const POST = route(async (req) => {
  const user = await requireUser();
  const body = z.object({ path: z.string().max(300) }).safeParse(await req.json().catch(() => null));
  if (body.success) await recordPageView(user.id, body.data.path);
  return new NextResponse(null, { status: 204 });
});
