import { addDays, dateOnly, toIsoDay, today } from "@/lib/dates";
import { prisma } from "@/lib/prisma";
import { getPrefs } from "@/lib/rules/prefs-service";
import { ageAt } from "@/lib/training/reference-curves";

import { type DayInput, estimateExpenditure, weeklyDraft, WINDOW_DAYS } from "./expenditure";

/**
 * v3.2 · Bloque M: datos del gasto adaptativo de **la propia usuaria** (nunca de una atleta: el peso no
 * sale hacia la entrenadora, y nada de esto va a la IA). Ventana: las 4 semanas que acaban ayer.
 */
export async function expenditureFor(userId: string) {
  const end = addDays(today(), -1);
  const start = addDays(end, -(WINDOW_DAYS - 1));
  const [intake, weights, firstMeal, firstWeight, goal, profile, prefs] = await Promise.all([
    prisma.macros.groupBy({ by: ["date"], where: { userId, date: { gte: start, lte: end } }, _sum: { kcal: true } }),
    prisma.recoveryMetrics.findMany({ where: { userId, date: { gte: start, lte: end }, bodyWeightKg: { not: null } }, select: { date: true, bodyWeightKg: true } }),
    prisma.macros.findFirst({ where: { userId }, orderBy: { date: "asc" }, select: { date: true } }),
    prisma.recoveryMetrics.findFirst({ where: { userId, bodyWeightKg: { not: null } }, orderBy: { date: "asc" }, select: { date: true } }),
    prisma.nutritionGoal.findFirst({ where: { userId, effectiveFrom: { lte: today() } }, orderBy: { effectiveFrom: "desc" } }),
    prisma.athleteProfile.findUnique({ where: { userId }, select: { birthDate: true } }),
    getPrefs(userId),
  ]);

  const byDay = new Map<string, DayInput>();
  for (let d = start; d <= end; d = addDays(d, 1)) byDay.set(toIsoDay(d), { day: toIsoDay(d), kcal: null, weightKg: null });
  for (const r of intake) {
    const row = byDay.get(toIsoDay(r.date));
    if (row) row.kcal = r._sum.kcal ?? null;
  }
  for (const r of weights) {
    const row = byDay.get(toIsoDay(r.date));
    if (row) row.weightKg = r.bodyWeightKg;
  }
  // Historia: días desde el primer registro de comida o peso (el que empiece antes)
  const first = [firstMeal?.date, firstWeight?.date].filter((d): d is Date => d != null).sort((a, b) => a.getTime() - b.getTime())[0];
  const historyDays = first ? Math.round((today().getTime() - dateOnly(first).getTime()) / 86_400_000) : 0;

  const estimate = estimateExpenditure([...byDay.values()], historyDays);
  const todayIso = toIsoDay(today());
  const age = profile?.birthDate ? ageAt(toIsoDay(profile.birthDate), todayIso) : null;
  const current = goal ? { kcal: goal.kcal, proteinG: goal.proteinG, carbsG: goal.carbsG, fatG: goal.fatG } : null;
  const draft = estimate.status === "ok" ? weeklyDraft({ estimate, current, goal: prefs.energyGoal, age }) : null;
  return {
    estimate,
    draft,
    // Menor de 18: la meta efectiva es mantener aunque la pref diga otra cosa
    energyGoal: age != null && age < 18 ? ("maintain" as const) : prefs.energyGoal,
    minor: age != null && age < 18,
    current: goal ? { ...current!, fiberG: goal.fiberG, trainingDayKcalFactor: goal.trainingDayKcalFactor, effectiveFrom: toIsoDay(goal.effectiveFrom) } : null,
    today: todayIso,
    window: { from: toIsoDay(start), to: toIsoDay(end) },
  };
}

export type ExpenditureView = Awaited<ReturnType<typeof expenditureFor>>;
