import "server-only";

import { addDays, dateOnly, toIsoDay } from "@/lib/dates";
import { prisma } from "@/lib/prisma";
import { dataKeyConfigured, openJson, sealJson } from "@/lib/security/data-key";

import { type CycleLogEntry, cyclePhase, type CycleSettings, suggestLight } from "./cycle";

/**
 * Datos del ciclo menstrual, cifrados en la BD. Solo los lee su dueña: no hay
 * acceso del entrenador ni se envían a la IA.
 */
export async function getCycle(userId: string, days = 400) {
  const [profile, logs] = await Promise.all([
    prisma.cycleProfile.findUnique({ where: { userId } }),
    prisma.cycleLog.findMany({ where: { userId, date: { gte: addDays(dateOnly(new Date()), -days) } }, orderBy: { date: "asc" } }),
  ]);
  return {
    settings: profile ? openJson<CycleSettings>(profile.data) : null,
    logs: logs.map((l) => ({ date: toIsoDay(l.date), ...openJson<Omit<CycleLogEntry, "date">>(l.data) })),
  };
}

export async function saveCycleSettings(userId: string, settings: CycleSettings) {
  const data = sealJson(settings);
  await prisma.cycleProfile.upsert({ where: { userId }, create: { userId, data }, update: { data } });
}

export async function logCycleDay(userId: string, entry: CycleLogEntry) {
  const date = dateOnly(entry.date);
  if (!entry.period && !entry.symptoms.length) {
    await prisma.cycleLog.deleteMany({ where: { userId, date } });
    return;
  }
  const data = sealJson({ period: entry.period, symptoms: entry.symptoms });
  await prisma.cycleLog.upsert({ where: { userId_date: { userId, date } }, create: { userId, date, data }, update: { data } });
}

export async function deleteCycleData(userId: string) {
  await prisma.$transaction([prisma.cycleLog.deleteMany({ where: { userId } }), prisma.cycleProfile.deleteMany({ where: { userId } })]);
}

/** Fase de hoy y si conviene la versión suave (null si no usa esta función). */
export async function cycleToday(userId: string, day: string) {
  if (!dataKeyConfigured()) return null; // sin clave no se pueden leer (ni se han podido guardar)
  const has = await prisma.cycleProfile.count({ where: { userId } });
  const hasLogs = has ? 1 : await prisma.cycleLog.count({ where: { userId } });
  if (!has && !hasLogs) return null;
  const { settings, logs } = await getCycle(userId, 200);
  return {
    phase: settings ? cyclePhase(day, settings, logs) : null,
    suggestion: suggestLight(day, settings, logs),
    today: logs.find((l) => l.date === day) ?? null,
  };
}
