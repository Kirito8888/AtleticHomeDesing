import { NextResponse } from "next/server";

import { parseBody, route } from "@/lib/api";
import { requireUser, resolveAthleteId } from "@/lib/auth/session";
import { dateOnly } from "@/lib/dates";
import { prisma } from "@/lib/prisma";
import { thresholdSchema } from "@/lib/training/schemas";

export const GET = route(async (req) => {
  const user = await requireUser();
  const userId = await resolveAthleteId(user, req.nextUrl.searchParams.get("athleteId"));
  return prisma.thresholdHistory.findMany({ where: { userId }, orderBy: { effectiveFrom: "desc" } });
});

/**
 * Registra umbrales vigentes desde una fecha. No reescribe el TSS de sesiones
 * pasadas: cada sesión se calculó con los umbrales de su día.
 */
export const POST = route(async (req) => {
  const user = await requireUser();
  const userId = await resolveAthleteId(user, req.nextUrl.searchParams.get("athleteId"), "write");
  const { effectiveFrom, ...data } = await parseBody(req, thresholdSchema);
  const date = dateOnly(effectiveFrom);
  const row = await prisma.thresholdHistory.upsert({
    where: { userId_effectiveFrom: { userId, effectiveFrom: date } },
    create: { userId, effectiveFrom: date, ...data },
    update: data,
  });
  return NextResponse.json(row, { status: 201 });
});
