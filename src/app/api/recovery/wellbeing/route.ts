import { NextResponse } from "next/server";

import { route } from "@/lib/api";
import { requireUser } from "@/lib/auth/session";
import { today, toIsoDay } from "@/lib/dates";
import { addWellbeing, listWellbeing, parseWellbeing } from "@/lib/recovery/wellbeing-service";

/** v1.7 · Diario de bienestar (sueño, ánimo, escalas). Solo el propio usuario: es salud y va cifrado. */
export const GET = route(async () => {
  const user = await requireUser();
  return listWellbeing(user.id, toIsoDay(today()));
});

export const POST = route(async (req) => {
  const user = await requireUser();
  const entry = parseWellbeing(await req.json().catch(() => null));
  return NextResponse.json(await addWellbeing(user.id, entry), { status: 201 });
});
