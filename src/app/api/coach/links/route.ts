import { NextResponse } from "next/server";
import { z } from "zod";

import { ApiError, parseBody, route } from "@/lib/api";
import { requireUser } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";

/** Vínculos del usuario: como coach (atletas) y como atleta (coaches). */
export const GET = route(async () => {
  const user = await requireUser();
  const [asCoach, asAthlete] = await Promise.all([
    prisma.coachAthlete.findMany({
      where: { coachId: user.id },
      include: { athlete: { select: { id: true, name: true, email: true } } },
    }),
    prisma.coachAthlete.findMany({
      where: { athleteId: user.id },
      include: { coach: { select: { id: true, name: true, email: true } } },
    }),
  ]);
  return { asCoach, asAthlete };
});

/** Un coach invita a un atleta por email; el vínculo queda PENDING hasta que el atleta acepte. */
export const POST = route(async (req) => {
  const user = await requireUser();
  if (user.role !== "COACH" && user.role !== "ADMIN") throw new ApiError(403, "Solo un coach puede invitar atletas");
  const { athleteEmail, canPlan } = await parseBody(
    req,
    z.object({ athleteEmail: z.string().trim().toLowerCase().email(), canPlan: z.boolean().default(false) }),
  );
  const athlete = await prisma.user.findUnique({ where: { email: athleteEmail }, select: { id: true } });
  // Mismo mensaje exista o no, para no filtrar qué emails están registrados.
  if (!athlete || athlete.id === user.id) throw new ApiError(404, "No se pudo enviar la invitación");
  const link = await prisma.coachAthlete.create({ data: { coachId: user.id, athleteId: athlete.id, canPlan } });
  return NextResponse.json(link, { status: 201 });
});
