import { ApiError } from "@/lib/api";
import { dateOnly } from "@/lib/dates";
import { prisma } from "@/lib/prisma";
import { tickStudyBlocks } from "@/lib/study/exam-plan-service";

export interface StudySessionInput {
  subject: string;
  minutes: number;
  date: string;
  moduleId?: string;
  clientKey?: string;
}

/**
 * Anota un bloque de estudio (temporizador o a mano). v2.9 · con `clientKey` es idempotente: repetirlo devuelve la
 * misma fila sin crear otra ni volver a tachar el plan. `moduleId` ajeno → 404; sin él se busca por nombre de módulo.
 */
export async function logStudySession(userId: string, s: StudySessionInput) {
  if (s.clientKey) {
    const dup = await prisma.studySession.findUnique({ where: { userId_clientKey: { userId, clientKey: s.clientKey } }, select: { id: true } });
    if (dup) return { id: dup.id, ticked: 0, duplicate: true };
  }
  let moduleId: string | null = null;
  if (s.moduleId) {
    const m = await prisma.studyModule.findFirst({ where: { id: s.moduleId, userId }, select: { id: true } });
    if (!m) throw new ApiError(404, "Asignatura no encontrada");
    moduleId = m.id;
  } else {
    const m = await prisma.studyModule.findFirst({ where: { userId, name: { equals: s.subject, mode: "insensitive" } }, select: { id: true } });
    moduleId = m?.id ?? null;
  }
  try {
    const row = await prisma.studySession.create({
      data: { userId, subject: s.subject, minutes: s.minutes, date: dateOnly(s.date), moduleId, clientKey: s.clientKey ?? null },
      select: { id: true },
    });
    // el temporizador tacha los bloques del plan de estudio que ya cubre
    return { ...row, ticked: await tickStudyBlocks(userId, s.subject, s.date), duplicate: false };
  } catch (e) {
    // carrera entre dos envíos con la misma clave: gana el primero
    if (s.clientKey && (e as { code?: string }).code === "P2002") {
      const dup = await prisma.studySession.findUnique({ where: { userId_clientKey: { userId, clientKey: s.clientKey } }, select: { id: true } });
      if (dup) return { id: dup.id, ticked: 0, duplicate: true };
    }
    throw e;
  }
}
