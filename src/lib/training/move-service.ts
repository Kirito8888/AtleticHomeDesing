import "server-only";

import { z } from "zod";

import { ApiError } from "@/lib/api";
import { addDays, dateOnly, isoDate, today, toIsoDay } from "@/lib/dates";
import { cyclePredictions } from "@/lib/health/cycle-service";
import { rescheduleOptions } from "@/lib/planning/reschedule";
import { prisma } from "@/lib/prisma";
import { getPrefs } from "@/lib/rules/prefs-service";
import { listSlots } from "@/lib/study/schedule-service";

export const moveSchema = z.object({ date: isoDate, copy: z.boolean().default(false) });

const THROWS = ["JAVELIN", "SHOT_PUT", "DISCUS", "HAMMER", "WEIGHT_THROW", "OTHER"];

/**
 * Mueve (o duplica) una sesión PLANIFICADA a otro día. Si viene del plan, el
 * día del plan se mueve con ella (al reimportar el PDF vuelve a su fecha).
 * Devuelve un aviso si deja dos sesiones de lanzamiento a menos de las horas de Mis reglas.
 */
export async function moveSession(userId: string, id: string, input: z.infer<typeof moveSchema>) {
  const s = await prisma.trainingSession.findFirst({
    where: { id, userId },
    include: { technical: { select: { event: true } } },
  });
  if (!s) throw new ApiError(404, "Sesión no encontrada");
  if (s.status !== "PLANNED") throw new ApiError(409, "Solo se mueven las sesiones planificadas");
  const date = dateOnly(input.date);
  let targetId = s.id;
  if (input.copy) {
    targetId = (
      await prisma.trainingSession.create({
        data: { userId, plannedById: s.plannedById, cycleId: s.cycleId, date, type: s.type, discipline: s.discipline, status: "PLANNED", title: s.title, durationSec: s.durationSec, notes: s.notes },
        select: { id: true },
      })
    ).id;
  } else {
    await prisma.$transaction([
      prisma.trainingSession.update({ where: { id: s.id }, data: { date } }),
      prisma.planDay.updateMany({ where: { userId, sessionId: s.id }, data: { date } }),
    ]);
  }

  // ¿Rompe las horas mínimas entre sesiones de lanzamiento? (sesiones técnicas o días de plan con jabalina)
  let warning: string | null = null;
  const isThrow = (s.technical && THROWS.includes(s.technical.event)) || /jabalina|lanzamiento|javelin/i.test(s.title ?? "");
  if (isThrow) {
    const { throwMinHours } = await getPrefs(userId);
    const span = Math.ceil(throwMinHours / 24);
    const near = await prisma.trainingSession.findMany({
      where: {
        userId,
        id: { not: targetId },
        status: { in: ["PLANNED", "COMPLETED"] },
        date: { gte: addDays(date, -span + 1), lte: addDays(date, span - 1) },
        OR: [{ technical: { event: { in: THROWS as never } } }, { title: { contains: "jabalina", mode: "insensitive" } }, { title: { contains: "lanzamiento", mode: "insensitive" } }],
      },
      select: { date: true },
    });
    if (near.length) warning = `Queda a menos de ${throwMinHours} h de otra sesión de lanzamiento (${[...new Set(near.map((n) => toIsoDay(n.date)))].join(", ")}).`;
  }
  return { id: targetId, warning };
}

/** v1.6 · Días propuestos para una sesión planificada que no se hizo (no mueve nada). */
export async function rescheduleSuggestions(userId: string, id: string, horizon = 7) {
  const s = await prisma.trainingSession.findFirst({ where: { id, userId, status: "PLANNED" }, include: { technical: { select: { event: true } } } });
  if (!s) throw new ApiError(404, "Sesión no encontrada");
  const todayIso = toIsoDay(today());
  const from = addDays(dateOnly(todayIso), -3);
  const to = addDays(dateOnly(todayIso), horizon + 3);
  const isThrow = Boolean((s.technical && THROWS.includes(s.technical.event)) || /jabalina|lanzamiento|javelin/i.test(s.title ?? ""));
  const [{ throwMinHours }, others, slots, predicted] = await Promise.all([
    getPrefs(userId),
    prisma.trainingSession.findMany({
      where: { userId, id: { not: id }, status: { in: ["PLANNED", "COMPLETED"] }, date: { gte: from, lte: to } },
      select: { date: true, status: true, title: true, technical: { select: { event: true } } },
    }),
    listSlots(userId),
    cyclePredictions(userId, todayIso, toIsoDay(to)),
  ]);
  const busy: Record<string, number> = {};
  for (const o of others) if (o.status === "PLANNED") busy[toIsoDay(o.date)] = (busy[toIsoDay(o.date)] ?? 0) + 1;
  return rescheduleOptions({
    today: todayIso,
    horizon,
    isThrow,
    throwDates: others.filter((o) => (o.technical && THROWS.includes(o.technical.event)) || /jabalina|lanzamiento|javelin/i.test(o.title ?? "")).map((o) => toIsoDay(o.date)),
    minHours: throwMinHours,
    examDates: slots.filter((x) => x.kind === "EXAM" && x.date).map((x) => x.date!),
    symptomDates: predicted.filter((p) => p.symptoms).map((p) => p.date),
    busy,
  });
}
