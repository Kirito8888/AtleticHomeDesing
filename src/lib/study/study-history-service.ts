import "server-only";

import { prisma } from "@/lib/prisma";
import { requireModule } from "@/lib/study/modules-service";
import type { MicroSessionInput, SelfTestAttemptInput } from "@/lib/study/study-history";

export interface SelfTestAttemptView {
  id: string;
  takenAt: string;
  score: number;
  label: string;
  questions: number | null;
  weak: string[];
  imported: boolean;
}
export interface MicroSessionView {
  id: string;
  clientKey: string;
  title: string;
  stepsDone: number;
  stepsTotal: number;
  focusMin: number;
  restMin: number;
  completedAt: string;
  imported: boolean;
}

/** Intentos de la usuaria en una asignatura, del más reciente al más antiguo. @throws {ApiError} 404 asignatura ajena. */
export async function listSelfTests(userId: string, moduleId: string, take = 20): Promise<SelfTestAttemptView[]> {
  await requireModule(userId, moduleId);
  const rows = await prisma.studySelfTestAttempt.findMany({ where: { userId, moduleId }, orderBy: { takenAt: "desc" }, take });
  return rows.map((r) => ({ id: r.id, takenAt: r.takenAt.toISOString(), score: r.score, label: r.label, questions: r.questions, weak: r.weak as string[], imported: r.imported }));
}

/** Guarda intentos de forma idempotente (mismo `takenAt` = no se duplica). @throws {ApiError} 404 asignatura ajena. */
export async function saveSelfTests(userId: string, moduleId: string, inputs: SelfTestAttemptInput[]): Promise<SelfTestAttemptView[]> {
  await requireModule(userId, moduleId);
  await prisma.studySelfTestAttempt.createMany({
    data: inputs.map((i) => ({ userId, moduleId, takenAt: i.takenAt, score: i.score, label: i.label, questions: i.questions ?? null, weak: i.weak, answers: i.answers ?? undefined, imported: i.imported })),
    skipDuplicates: true,
  });
  return listSelfTests(userId, moduleId);
}

/** Sesiones de micro-pasos completadas de la usuaria, de la más reciente a la más antigua. */
export async function listMicroSessions(userId: string, take = 20): Promise<MicroSessionView[]> {
  const rows = await prisma.studyMicroSession.findMany({ where: { userId }, orderBy: { completedAt: "desc" }, take });
  return rows.map((r) => ({ id: r.id, clientKey: r.clientKey, title: r.title, stepsDone: r.stepsDone, stepsTotal: r.stepsTotal, focusMin: r.focusMin, restMin: r.restMin, completedAt: r.completedAt.toISOString(), imported: r.imported }));
}

/** Guarda una sesión de forma idempotente por `clientKey`. */
export async function saveMicroSession(userId: string, i: MicroSessionInput): Promise<MicroSessionView[]> {
  await prisma.studyMicroSession.createMany({
    data: [{ userId, clientKey: i.clientKey, title: i.title, steps: i.steps, stepsDone: i.stepsDone, stepsTotal: i.steps.length, focusMin: i.focusMin, restMin: i.restMin, completedAt: i.completedAt, imported: i.imported }],
    skipDuplicates: true,
  });
  return listMicroSessions(userId);
}
