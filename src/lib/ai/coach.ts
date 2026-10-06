import "server-only";
import { z } from "zod";

import type { Prisma } from "@/generated/prisma/client";
import { generateJson } from "@/lib/ai/gemini";
import { assertAiAllowed } from "@/lib/ai/guard";
import { addDays, round, startOfIsoWeek, toIsoDay } from "@/lib/dates";
import { prisma } from "@/lib/prisma";
import { strengthSessionStress } from "@/lib/training/strength";
import { ensureLoadsUpToDate } from "@/lib/training/service";

const BASELINE_DAYS = 28;

const avg = (xs: Array<number | null | undefined>) => {
  const v = xs.filter((x): x is number => x != null);
  return v.length ? round(v.reduce((a, b) => a + b, 0) / v.length, 1) : null;
};

/**
 * Resumen numérico de la semana (lunes–domingo) para el coach IA: carga por
 * tipo de sesión, evolución PMC, recuperación frente a la línea base de 28
 * días y próximo calendario competitivo. Es lo único que ve el modelo.
 */
export async function buildWeeklySnapshot(userId: string, weekStart: Date) {
  await ensureLoadsUpToDate(userId);
  const weekEnd = addDays(weekStart, 6);
  const baselineStart = addDays(weekStart, -BASELINE_DAYS);

  const [profile, loads, sessions, prevWeek, recovery, events, cycles] = await Promise.all([
    prisma.athleteProfile.findUnique({ where: { userId } }),
    prisma.dailyLoad.findMany({ where: { userId, date: { gte: baselineStart, lte: weekEnd } }, orderBy: { date: "asc" } }),
    prisma.trainingSession.findMany({
      where: { userId, date: { gte: weekStart, lte: weekEnd } },
      orderBy: { date: "asc" },
      include: {
        track: { select: { modality: true, distanceM: true, hrAvg: true, _count: { select: { intervals: true } } } },
        technical: { select: { event: true, implementWeightG: true, bestMarkM: true, attempts: { select: { isFoul: true, rating: true } } } },
        strength: { select: { tonnageKg: true, sets: { select: { reps: true, weightKg: true, rpe: true, rir: true, isWarmup: true } } } },
      },
    }),
    prisma.trainingSession.aggregate({
      where: { userId, status: "COMPLETED", date: { gte: addDays(weekStart, -7), lt: weekStart } },
      _sum: { tss: true },
    }),
    prisma.recoveryMetrics.findMany({ where: { userId, date: { gte: baselineStart, lte: weekEnd } }, orderBy: { date: "asc" } }),
    prisma.calendarEvent.findMany({
      where: { userId, startAt: { gt: weekEnd, lte: addDays(weekEnd, 35) } },
      orderBy: { startAt: "asc" },
      select: { type: true, title: true, startAt: true, priority: true },
    }),
    prisma.trainingCycle.findMany({
      where: { userId, startDate: { lte: weekEnd }, endDate: { gte: weekStart } },
      select: { level: true, phase: true, name: true, goal: true, plannedLoad: true, startDate: true, endDate: true },
    }),
  ]);

  const completed = sessions.filter((s) => s.status === "COMPLETED");
  const byType = Object.fromEntries(
    (["TRACK", "TECHNICAL", "STRENGTH", "MIXED"] as const).map((t) => {
      const list = completed.filter((s) => s.type === t);
      return [
        t,
        {
          sessions: list.length,
          tss: round(list.reduce((a, s) => a + (s.tss ?? 0), 0)),
          minutes: Math.round(list.reduce((a, s) => a + (s.durationSec ?? 0), 0) / 60),
        },
      ];
    }),
  );

  const weekLoads = loads.filter((l) => l.date >= weekStart);
  const weekRecovery = recovery.filter((r) => r.date >= weekStart);
  const baseRecovery = recovery.filter((r) => r.date < weekStart);
  const first = weekLoads[0];
  const last = weekLoads.at(-1);

  return {
    week: { start: toIsoDay(weekStart), end: toIsoDay(weekEnd) },
    athlete: { primaryDiscipline: profile?.primaryDiscipline ?? null, disciplines: profile?.disciplines ?? [], sex: profile?.sex ?? null },
    load: {
      totalTss: round(completed.reduce((a, s) => a + (s.tss ?? 0), 0)),
      previousWeekTss: round(prevWeek._sum.tss ?? 0),
      byType,
      plannedNotDone: sessions.filter((s) => s.status === "PLANNED" || s.status === "SKIPPED").length,
      pmc: last
        ? {
            ctlStart: first?.ctl ?? null,
            ctlEnd: last.ctl,
            atlEnd: last.atl,
            tsbEnd: last.tsb,
            acwrEnd: last.acwr,
            rampRate: first ? round(last.ctl - first.ctl, 2) : null,
          }
        : null,
    },
    sessions: completed.map((s) => ({
      date: toIsoDay(s.date),
      type: s.type,
      title: s.title,
      tss: s.tss,
      method: s.tssMethod,
      rpe: s.sessionRpe,
      minutes: s.durationSec ? Math.round(s.durationSec / 60) : null,
      track: s.track ? { modality: s.track.modality, km: s.track.distanceM ? round(s.track.distanceM / 1000, 2) : null, hrAvg: s.track.hrAvg, intervals: s.track._count.intervals } : undefined,
      technical: s.technical
        ? {
            event: s.technical.event,
            implementG: s.technical.implementWeightG,
            attempts: s.technical.attempts.length,
            fouls: s.technical.attempts.filter((a) => a.isFoul).length,
            bestMarkM: s.technical.bestMarkM,
            avgRating: avg(s.technical.attempts.map((a) => a.rating)),
          }
        : undefined,
      strength: s.strength
        ? {
            tonnageKg: s.strength.tonnageKg,
            workingSets: s.strength.sets.filter((x) => !x.isWarmup).length,
            hardSetEquivalents: round(strengthSessionStress(s.strength.sets).hardSets),
          }
        : undefined,
    })),
    recovery: {
      daily: weekRecovery.map((r) => ({
        date: toIsoDay(r.date),
        readiness: r.readinessScore,
        hrv: r.hrvRmssdMs,
        sleepH: r.sleepHours,
        rhr: r.restingHr,
        doms: r.doms,
      })),
      weekAvg: {
        hrv: avg(weekRecovery.map((r) => r.hrvRmssdMs)),
        sleepH: avg(weekRecovery.map((r) => r.sleepHours)),
        rhr: avg(weekRecovery.map((r) => r.restingHr)),
        readiness: avg(weekRecovery.map((r) => r.readinessScore)),
        doms: avg(weekRecovery.map((r) => r.doms)),
      },
      baseline28d: {
        hrv: avg(baseRecovery.map((r) => r.hrvRmssdMs)),
        sleepH: avg(baseRecovery.map((r) => r.sleepHours)),
        rhr: avg(baseRecovery.map((r) => r.restingHr)),
      },
      daysLogged: weekRecovery.length,
    },
    periodization: cycles.map((c) => ({ ...c, startDate: toIsoDay(c.startDate), endDate: toIsoDay(c.endDate) })),
    upcoming: events.map((e) => ({ ...e, startAt: toIsoDay(e.startAt) })),
  };
}

export type WeeklySnapshot = Awaited<ReturnType<typeof buildWeeklySnapshot>>;

export const coachReportSchema = z.object({
  summary: z.string().describe("Resumen de la semana en markdown, 3-6 frases"),
  riskLevel: z.enum(["LOW", "MODERATE", "HIGH"]).describe("Riesgo de sobrecarga/lesión"),
  keyFindings: z.array(z.string()).max(6),
  recommendations: z
    .array(
      z.object({
        area: z.enum(["LOAD", "RECOVERY", "SLEEP", "TECHNIQUE", "STRENGTH", "NUTRITION", "COMPETITION"]),
        action: z.string().describe("Acción concreta y medible para la próxima semana"),
        rationale: z.string().describe("Dato del snapshot que la justifica"),
        priority: z.enum(["HIGH", "MEDIUM", "LOW"]),
      }),
    )
    .min(1)
    .max(8),
  nextWeek: z.object({
    targetTssMin: z.number(),
    targetTssMax: z.number(),
    maxHardSessions: z.number().int(),
    notes: z.string(),
  }),
  dataGaps: z.array(z.string()).max(5).describe("Datos que faltan y limitan el análisis"),
});

export const COACH_SYSTEM_PROMPT = `Eres el Coach de Rendimiento de LifeOS: preparador físico de atletismo
(velocidad, fondo, saltos y lanzamientos como la jabalina) y de fuerza. Respondes en español.

Recibes un snapshot JSON de la semana de un atleta. Analiza la relación entre CARGA
(TSS por tipo: pista/cardio, técnica, fuerza; CTL, ATL, TSB, ACWR, rampa) y RECUPERACIÓN
(VFC/rMSSD, sueño, FC en reposo, DOMS, readiness) y recomienda ajustes para la próxima semana.

Criterios (aplícalos con juicio, no como reglas ciegas):
- Rampa de CTL > 5-8 puntos/semana o ACWR > 1.3-1.5 → riesgo de sobrecarga creciente.
- TSB < -20 a -30 sostenido → fatiga acumulada; TSB +5 a +15 → forma para competir.
- VFC media de la semana claramente por debajo de su línea base de 28 días, junto a FC
  en reposo por encima de la suya → recuperación incompleta; prioriza reducir intensidad.
- Sueño medio < 7 h → recomendación de sueño antes que cambios de carga.
- Lanzadores/saltadores: el volumen de lanzamientos/saltos máximos con fatiga alta y DOMS
  elevados aumenta el riesgo en codo, hombro, lumbar y tendón rotuliano/aquíleo; ajusta
  primero el número de intentos de máxima intensidad o el peso del implemento.
- Fuerza: con readiness bajo, mantén intensidad (cargas) y recorta volumen (series duras).
- Si hay competición en ≤ 14 días, plantea tapering (−40 a −60 % de volumen, intensidad
  mantenida). Respeta la fase de periodización indicada.

Reglas:
- Cada recomendación debe citar el dato concreto que la justifica.
- Si faltan datos, dilo en dataGaps; no los supongas.
- No diagnostiques lesiones ni des consejo médico; ante dolor persistente, recomienda
  consultar a un profesional sanitario.`;

export async function generateWeeklyCoachReport(userId: string, weekOf: Date) {
  await assertAiAllowed(userId); // consentimiento del atleta, aunque lo pida su coach
  const weekStart = startOfIsoWeek(weekOf);
  const snapshot = await buildWeeklySnapshot(userId, weekStart);
  const { data, model } = await generateJson(coachReportSchema, {
    system: COACH_SYSTEM_PROMPT,
    prompt: `Snapshot semanal:\n${JSON.stringify(snapshot)}`,
    temperature: 0.3,
  });
  const fields = {
    inputSnapshot: snapshot as unknown as Prisma.InputJsonValue,
    summary: data.summary,
    recommendations: data as unknown as Prisma.InputJsonValue,
    model,
  };
  return prisma.coachReport.upsert({
    where: { userId_weekStart: { userId, weekStart } },
    create: { userId, weekStart, ...fields },
    update: { ...fields, createdAt: new Date() },
  });
}
