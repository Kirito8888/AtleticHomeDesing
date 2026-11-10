import "server-only";

import { ApiError } from "@/lib/api";
import { dateOnly, toIsoDay } from "@/lib/dates";
import { SESSION_TYPE_LABEL } from "@/lib/format";
import { prisma } from "@/lib/prisma";
import { getPrefs } from "@/lib/rules/prefs-service";

import { dayCapacity } from "./exam-plan";
import { moduleView } from "./modules-service";
import { type AcceptRoutePlanInput, planDays, routeToBlocks } from "./route-plan";
import { classMinutes } from "./schedule";
import { listSlots } from "./schedule-service";
import { prioritize } from "./study-route";

/**
 * Qué hay ya en cada día y cuánto queda libre para esta asignatura: cuota diaria (`studyDailyMin`)
 * menos la mitad de las clases y el recorte por entreno (`dayCapacity`, como el plan de exámenes) y
 * menos los bloques de estudio que se quedan (los de otras asignaturas/exámenes y los ya hechos).
 * Los pendientes de esta asignatura NO cuentan: aceptar los sustituye.
 */
async function dayContext(userId: string, moduleId: string, days: string[]) {
  if (!days.length) return { prefs: await getPrefs(userId), ctx: [] as DayContext[], replaced: 0 };
  const range = { gte: dateOnly(days[0]), lte: dateOnly(days[days.length - 1]) };
  const [prefs, slots, sessions, blocks, replaced] = await Promise.all([
    getPrefs(userId),
    listSlots(userId),
    prisma.trainingSession.findMany({ where: { userId, status: { not: "SKIPPED" }, date: range }, select: { date: true, title: true, type: true } }),
    prisma.studyPlanBlock.findMany({
      // OR explícito: un NOT sobre moduleId dejaría fuera los bloques con moduleId NULL (lógica de tres valores)
      where: { userId, date: range, OR: [{ moduleId: null }, { moduleId: { not: moduleId } }, { done: true }] },
      select: { date: true, subject: true, minutes: true, done: true, topic: { select: { name: true } } },
      orderBy: [{ date: "asc" }, { createdAt: "asc" }],
    }),
    prisma.studyPlanBlock.count({ where: { userId, moduleId, done: false, date: { gte: range.gte } } }),
  ]);
  const ctx: DayContext[] = days.map((day) => {
    const training = sessions.filter((s) => toIsoDay(s.date) === day).map((s) => s.title ?? SESSION_TYPE_LABEL[s.type]);
    const other = blocks.filter((b) => toIsoDay(b.date) === day).map((b) => ({ subject: b.subject, topic: b.topic?.name ?? null, minutes: b.minutes, done: b.done }));
    const base = dayCapacity({ dailyMin: prefs.studyDailyMin, classMin: classMinutes(slots, day), training: training.length > 0, trainingCutMin: prefs.studyTrainingCutMin });
    return { date: day, training, other, free: Math.max(0, base - other.reduce((a, b) => a + b.minutes, 0)) };
  });
  return { prefs, ctx, replaced };
}

export type DayContext = {
  date: string;
  /** Entrenos de ese día (no se tocan; solo recortan el tiempo de estudio). */
  training: string[];
  /** Bloques de estudio que ya están ese día y se quedan. */
  other: { subject: string; topic: string | null; minutes: number; done: boolean }[];
  /** Minutos libres para esta asignatura ese día. */
  free: number;
};

/**
 * Borrador (solo lectura) de la ruta priorizada de la asignatura repartida en bloques por día.
 * Nada se escribe: la usuaria lo revisa y lo acepta con `acceptRoutePlan`.
 *
 * @throws ApiError 404 si la asignatura no existe o es de otra usuaria.
 */
export async function routeDraft(userId: string, moduleId: string, today: string) {
  const m = await moduleView(userId, moduleId, today);
  const days = planDays(today, m.examDate);
  const { prefs, ctx, replaced } = await dayContext(userId, moduleId, days);
  const route = prioritize({ topics: m.topics, daysLeft: m.daysLeft, dailyMin: prefs.studyDailyMin });
  const free = new Map(ctx.map((d) => [d.date, d.free]));
  const plan = routeToBlocks({ route, days, capacity: (d) => free.get(d) ?? 0, blockMin: prefs.studyBlockMin });
  return {
    moduleId: m.id,
    name: m.name,
    examDate: m.examDate,
    daysLeft: m.daysLeft,
    dailyMin: prefs.studyDailyMin,
    /** Días planificables con lo que ya hay en cada uno. */
    days: ctx,
    blocks: plan.blocks,
    unscheduled: plan.unscheduled,
    /** Bloques pendientes de esta asignatura (de hoy en adelante) que se sustituirán al aceptar. */
    replaced,
    topics: m.topics.filter((t) => !t.done).map((t) => ({ id: t.id, name: t.name })),
  };
}

/**
 * Persiste el borrador revisado: borra solo los bloques pendientes de ESTA asignatura de hoy en
 * adelante y crea los nuevos (con `moduleId`/`topicId`). No toca entrenos, bloques del plan de
 * exámenes, bloques de otras asignaturas ni los ya hechos.
 *
 * @throws ApiError 404 asignatura ajena o inexistente · 400 tema que no es de la asignatura o fecha
 *   fuera de plazo (antes de hoy o desde el día del examen).
 */
export async function acceptRoutePlan(userId: string, moduleId: string, today: string, input: AcceptRoutePlanInput) {
  const m = await moduleView(userId, moduleId, today);
  const days = new Set(planDays(today, m.examDate));
  const topics = new Set(m.topics.map((t) => t.id));
  for (const b of input.blocks) {
    if (!topics.has(b.topicId)) throw new ApiError(400, "Ese tema no es de esta asignatura");
    if (!days.has(b.date)) throw new ApiError(400, m.examDate ? "Fecha fuera de plazo: entre hoy y la víspera del examen" : "Fecha fuera de plazo: de hoy a cuatro semanas");
  }
  const from = dateOnly(today);
  const [removed, created] = await prisma.$transaction([
    prisma.studyPlanBlock.deleteMany({ where: { userId, moduleId, done: false, date: { gte: from } } }),
    prisma.studyPlanBlock.createMany({
      data: input.blocks.map((b) => ({ userId, moduleId, topicId: b.topicId, examId: null, subject: m.name, date: dateOnly(b.date), minutes: b.minutes })),
    }),
  ]);
  return { created: created.count, replaced: removed.count };
}
