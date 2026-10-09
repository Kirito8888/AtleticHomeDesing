import "server-only";

import { ApiError } from "@/lib/api";
import { addDays, dateOnly, toIsoDay } from "@/lib/dates";
import { prisma } from "@/lib/prisma";
import { getPrefs, updatePrefs } from "@/lib/rules/prefs-service";

import { blocksToTick, dayCapacity, planStudy } from "./exam-plan";
import { classMinutes } from "./schedule";
import { listSlots } from "./schedule-service";

/** Exámenes próximos con su objetivo (horas) y lo ya planificado y hecho; bloques desde hoy. */
export async function examPlanView(userId: string, today: string) {
  const [slots, prefs, blocks] = await Promise.all([
    listSlots(userId),
    getPrefs(userId),
    prisma.studyPlanBlock.findMany({ where: { userId, date: { gte: addDays(dateOnly(today), -60) } }, orderBy: [{ date: "asc" }, { subject: "asc" }] }),
  ]);
  const exams = slots
    .filter((s) => s.kind === "EXAM" && s.date && s.date > today)
    .sort((a, b) => a.date!.localeCompare(b.date!))
    .map((s) => {
      const mine = blocks.filter((b) => b.examId === s.id);
      return {
        id: s.id,
        subject: s.subject,
        date: s.date!,
        hours: prefs.examHours[s.id] ?? prefs.studyHoursPerExam,
        plannedMin: mine.reduce((a, b) => a + b.minutes, 0),
        doneMin: mine.filter((b) => b.done).reduce((a, b) => a + b.minutes, 0),
      };
    });
  return {
    exams,
    blocks: blocks.filter((b) => toIsoDay(b.date) >= today).map((b) => ({ id: b.id, examId: b.examId, subject: b.subject, date: toIsoDay(b.date), minutes: b.minutes, done: b.done })),
  };
}

/**
 * (Re)genera los bloques sugeridos desde hoy: borra los pendientes de hoy en adelante y
 * reparte lo que falta (objetivo − bloques ya hechos). Los hechos y los pasados se quedan.
 * Solo toca StudyPlanBlock: nunca el plan de entrenamiento.
 */
export async function generateExamPlan(userId: string, today: string, hours: Record<string, number>) {
  const prefs = await getPrefs(userId);
  if (Object.keys(hours).length) await updatePrefs(userId, { examHours: { ...prefs.examHours, ...hours } });
  const target = { ...prefs.examHours, ...hours };
  const from = dateOnly(today);
  const slots = await listSlots(userId);
  const exams = slots.filter((s) => s.kind === "EXAM" && s.date && s.date > today);
  const last = exams.reduce((a, e) => (e.date! > a ? e.date! : a), today);
  const [done, sessions] = await Promise.all([
    prisma.studyPlanBlock.groupBy({ by: ["examId"], where: { userId, done: true }, _sum: { minutes: true } }),
    prisma.trainingSession.findMany({ where: { userId, status: { not: "SKIPPED" }, date: { gte: from, lte: dateOnly(last) } }, select: { date: true } }),
  ]);
  const trainingDays = new Set(sessions.map((s) => toIsoDay(s.date)));
  const doneMin = new Map(done.map((d) => [d.examId, d._sum.minutes ?? 0]));
  const plan = planStudy({
    today,
    blockMin: prefs.studyBlockMin,
    capacity: (day) => dayCapacity({ dailyMin: prefs.studyDailyMin, classMin: classMinutes(slots, day), training: trainingDays.has(day), trainingCutMin: prefs.studyTrainingCutMin }),
    exams: exams.map((e) => ({ id: e.id, subject: e.subject, date: e.date!, minutes: Math.max(0, Math.round((target[e.id] ?? prefs.studyHoursPerExam) * 60) - (doneMin.get(e.id) ?? 0)) })),
  });
  await prisma.$transaction([
    prisma.studyPlanBlock.deleteMany({ where: { userId, done: false, date: { gte: from } } }),
    prisma.studyPlanBlock.createMany({ data: plan.blocks.map((b) => ({ userId, examId: b.examId, subject: b.subject, date: dateOnly(b.date), minutes: b.minutes })) }),
  ]);
  return { blocks: plan.blocks.length, shortfall: plan.shortfall };
}

/** Tras un pomodoro: tacha en orden los bloques del día de esa asignatura que ya cubren los minutos estudiados. */
export async function tickStudyBlocks(userId: string, subject: string, day: string) {
  const date = dateOnly(day);
  const [blocks, studied] = await Promise.all([
    prisma.studyPlanBlock.findMany({ where: { userId, subject, date }, orderBy: { createdAt: "asc" }, select: { id: true, minutes: true, done: true } }),
    prisma.studySession.aggregate({ where: { userId, subject, date }, _sum: { minutes: true } }),
  ]);
  const ids = blocksToTick(blocks, studied._sum.minutes ?? 0);
  if (ids.length) await prisma.studyPlanBlock.updateMany({ where: { userId, id: { in: ids } }, data: { done: true } });
  return ids.length;
}

export async function setBlockDone(userId: string, id: string, done: boolean) {
  const { count } = await prisma.studyPlanBlock.updateMany({ where: { id, userId }, data: { done } });
  if (!count) throw new ApiError(404, "Bloque no encontrado");
}

/** Bloques de estudio de hoy (para el pomodoro). */
export async function todayBlocks(userId: string, today: string) {
  return prisma.studyPlanBlock.findMany({ where: { userId, date: dateOnly(today) }, orderBy: { subject: "asc" }, select: { id: true, subject: true, minutes: true, done: true } });
}
