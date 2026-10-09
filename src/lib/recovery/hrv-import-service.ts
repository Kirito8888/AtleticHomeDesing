import "server-only";

import { dateOnly } from "@/lib/dates";
import { prisma } from "@/lib/prisma";
import { updatePrefs } from "@/lib/rules/prefs-service";
import { refreshReadiness } from "@/lib/training/service";

import { type HrvMapping, hrvCsvRows } from "./hrv-import";

/**
 * Importa VFC, FC en reposo y sueño. Solo escribe los campos que trae el CSV:
 * el resto del registro del día (control rápido, ánimo…) no se toca.
 */
export async function importHrvCsv(userId: string, text: string, mapping: HrvMapping, commit: boolean) {
  const { rows, errors } = hrvCsvRows(text, mapping);
  if (!commit) return { rows: rows.slice(0, 200), total: rows.length, errors: errors.slice(0, 50) };
  for (const r of rows) {
    const data = Object.fromEntries(
      Object.entries({ hrvRmssdMs: r.hrvRmssdMs, restingHr: r.restingHr, sleepHours: r.sleepHours }).filter(([, v]) => v != null),
    );
    const date = dateOnly(r.date);
    await prisma.recoveryMetrics.upsert({ where: { userId_date: { userId, date } }, create: { userId, date, ...data }, update: data });
  }
  // El readiness de cada día usa la línea base de los anteriores: se recalcula en orden.
  for (const r of [...rows].sort((a, b) => (a.date < b.date ? -1 : 1))) await refreshReadiness(userId, dateOnly(r.date));
  await updatePrefs(userId, { hrvCsvMapping: mapping });
  return { imported: rows.length, errors: errors.length };
}
