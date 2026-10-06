import { NextResponse } from "next/server";

import { parseBody, route } from "@/lib/api";
import { requireUser, resolveAthleteId } from "@/lib/auth/session";
import { createInjury, injurySchema, listInjuries } from "@/lib/recovery/injuries";

/** Lesiones (activas primero). Un coach solo las ve con el permiso RECOVERY. */
export const GET = route(async (req) => {
  const user = await requireUser();
  const userId = await resolveAthleteId(user, req.nextUrl.searchParams.get("athleteId"), "RECOVERY");
  return listInjuries(userId);
});

/** Solo el propio atleta registra sus molestias. */
export const POST = route(async (req) => {
  const user = await requireUser();
  return NextResponse.json(await createInjury(user.id, await parseBody(req, injurySchema)), { status: 201 });
});
