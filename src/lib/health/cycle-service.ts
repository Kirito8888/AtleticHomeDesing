import "server-only";

import { addDays, dateOnly, toIsoDay } from "@/lib/dates";
import { prisma } from "@/lib/prisma";
import { ensureHealthConsent, recordConsent } from "@/lib/privacy/service";
import { dataKeyConfigured, openJson, sealJson } from "@/lib/security/data-key";

import { type CycleLogEntry, cyclePhase, type CycleSettings, suggestLight } from "./cycle";
import { predictedDays, readWomenSettings } from "./women";
import { learnedPrediction } from "./women-plus";

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
  await ensureHealthConsent(userId);
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
  // Sin datos de salud ya no hay nada que consentir: retirado (art. 7.3)
  if (!(await prisma.womenHealth.count({ where: { userId } }))) await recordConsent(userId, "HEALTH", false);
}

/** Fase de hoy y si conviene la versión suave (null si no usa esta función). */
export async function cycleToday(userId: string, day: string) {
  if (!dataKeyConfigured()) return null; // sin clave no se pueden leer (ni se han podido guardar)
  const has = await prisma.cycleProfile.count({ where: { userId } });
  const hasLogs = has ? 1 : await prisma.cycleLog.count({ where: { userId } });
  if (!has && !hasLogs) return null;
  const { settings, logs } = await getCycle(userId, 400);
  // v1.6: con 3 ciclos o más manda lo aprendido de sus registros
  const learned = learnedPrediction(settings, logs, day, day, await symptomProbMin(userId));
  const today = logs.find((l) => l.date === day);
  return {
    phase: settings ? cyclePhase(day, settings, logs) : null,
    suggestion: today?.symptoms.length
      ? "Hoy has marcado síntomas"
      : learned
        ? learned.length
          ? "Según tus últimos ciclos, estos días sueles tener síntomas"
          : null
        : suggestLight(day, settings, logs),
    today: logs.find((l) => l.date === day) ?? null,
  };
}

async function symptomProbMin(userId: string): Promise<number> {
  const w = await prisma.womenHealth.findUnique({ where: { userId } });
  return readWomenSettings(w ? openJson(w.data) : null).symptomProbMin;
}

/** Días previstos de regla y síntomas (lo aprendido si hay 3 ciclos; si no, lo que ella indicó). Solo para su dueña. */
export async function cyclePredictions(userId: string, from: string, to: string) {
  if (!dataKeyConfigured()) return [];
  const { settings, logs } = await getCycle(userId, 400);
  if (!settings && !logs.length) return [];
  return predictedDays(settings, logs, from, to, learnedPrediction(settings, logs, from, to, await symptomProbMin(userId)));
}
