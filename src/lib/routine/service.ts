import "server-only";

import type { Prisma } from "@/generated/prisma/client";
import { saveDraftPlan } from "@/lib/ai-plan/service";
import { validateAiPlan } from "@/lib/ai-plan/validate";
import { ApiError } from "@/lib/api";
import { dateOnly, toIsoDay } from "@/lib/dates";
import { womenMode } from "@/lib/health/women-service";
import { prisma } from "@/lib/prisma";

import { generateRoutine } from "./generator";
import { buildProfile, type Profile, project, weeksBetween } from "./profile";
import { type RoutineAnswers, TESTS, type TestKey } from "./questionnaire";

/**
 * v1.7 · Crea la rutina: perfil → plan en borrador (source ROUTINE, código RT1, RT2…) → tests iniciales.
 * Nada se activa: el plan se revisa y se activa como cualquier otro.
 */
export async function createRoutine(userId: string, answers: RoutineAnswers, today: string) {
  const profile = buildProfile(answers);
  if (profile.blocked.length) {
    throw new ApiError(
      422,
      `Por tus respuestas (${profile.blocked.map((b) => b.toLowerCase()).join("; ")}), antes de empezar consulta con un profesional sanitario. Cuando te dé el visto bueno, vuelve a crear la rutina.`,
      { code: "safety" },
    );
  }
  if ((await womenMode(userId)) !== "NONE") {
    throw new ApiError(422, "Con el modo embarazo o posparto activo no se generan rutinas: sigue las pautas de tu médica o matrona y la vuelta por fases de «Salud de la mujer».", { code: "safety" });
  }
  const { plan, request } = generateRoutine(answers, profile.level);
  const warnings = validateAiPlan(plan, request);
  const draft = await saveDraftPlan(userId, plan, request, { source: "ROUTINE", prefix: "RT", meta: { request, generator: "rutina-v1", warnings }, warnings });
  const routine = await prisma.routineProfile.create({
    data: { userId, mesoCode: draft.code, answers: answers as unknown as Prisma.InputJsonValue, profile: profile as unknown as Prisma.InputJsonValue },
    select: { id: true },
  });
  const tests = (Object.keys(TESTS) as TestKey[]).flatMap((k) => (answers.tests[k] != null ? [{ userId, routineId: routine.id, metric: k, value: answers.tests[k]!, date: dateOnly(today) }] : []));
  if (tests.length) await prisma.routineTest.createMany({ data: tests });
  return { id: routine.id, code: draft.code, level: profile.level, warnings };
}

export async function addRoutineTest(userId: string, routineId: string, metric: TestKey, value: number, date: string) {
  const r = await prisma.routineProfile.findFirst({ where: { id: routineId, userId }, select: { id: true } });
  if (!r) throw new ApiError(404, "Rutina no encontrada");
  return prisma.routineTest.create({ data: { userId, routineId, metric, value, date: dateOnly(date) }, select: { id: true } });
}

export async function listRoutines(userId: string) {
  return prisma.routineProfile.findMany({ where: { userId }, orderBy: { createdAt: "desc" }, select: { id: true, mesoCode: true, createdAt: true, profile: true } });
}

/** Todo lo de la página de la rutina: perfil, plan, y por cada test la proyección y los puntos reales. */
export async function routineView(userId: string, id: string) {
  const r = await prisma.routineProfile.findFirst({ where: { id, userId }, include: { tests: { orderBy: { date: "asc" } } } });
  if (!r) return null;
  const answers = r.answers as unknown as RoutineAnswers;
  const profile = r.profile as unknown as Profile;
  const meso = await prisma.planMeso.findUnique({ where: { userId_code: { userId, code: r.mesoCode } }, select: { code: true, name: true, status: true, startDate: true, endDate: true } });
  const start = toIsoDay(r.createdAt);
  const horizonWeeks = Math.round(answers.horizonMonths * 4.35);
  const metrics = (Object.keys(TESTS) as TestKey[]).flatMap((k) => {
    const real = r.tests.filter((t) => t.metric === k).map((t) => ({ week: weeksBetween(start, toIsoDay(t.date)), value: t.value, date: toIsoDay(t.date) }));
    if (!real.length) return [];
    const baseline = real[0].value;
    const curve = project(k, baseline, profile.level, answers.weekdays.length, horizonWeeks);
    const atShort = curve.reduce((best, p) => (Math.abs(p.week - answers.shortWeeks) < Math.abs(best.week - answers.shortWeeks) ? p : best), curve[0]);
    return [{ key: k, ...TESTS[k], baseline, curve, real, shortTerm: atShort, longTerm: curve[curve.length - 1] }];
  });
  return { id: r.id, createdAt: r.createdAt, answers, profile, meso, metrics, horizonWeeks };
}
