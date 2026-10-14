import "server-only";

import { addDays, dateOnly, today } from "@/lib/dates";
import { MICROS, microSummary, microTargets } from "@/lib/nutrition/micros";
import { prisma } from "@/lib/prisma";
import { getPrefs } from "@/lib/rules/prefs-service";

/** v1.10 · Media de micronutrientes de los últimos `days` días (con algo anotado) frente a los objetivos. */
export async function microsOverview(userId: string, days = 7) {
  const from = dateOnly(addDays(today(), -(days - 1)));
  const [entries, prefs, profile] = await Promise.all([
    prisma.macros.findMany({ where: { userId, date: { gte: from } }, select: { date: true, ...Object.fromEntries(MICROS.map((m) => [m, true])) } as never }),
    getPrefs(userId),
    prisma.athleteProfile.findUnique({ where: { userId }, select: { sex: true } }),
  ]);
  const targets = microTargets(prefs.microTargets, profile?.sex);
  return { days, entries: (entries as unknown[]).length, custom: prefs.microTargets, sex: profile?.sex ?? null, rows: microSummary(entries as never, targets) };
}
