import "server-only";

import { dateOnly, toIsoDay } from "@/lib/dates";
import { prisma } from "@/lib/prisma";
import { updatePrefs } from "@/lib/rules/prefs-service";
import { refreshReadinessRange } from "@/lib/training/service";

import { type HrvMapping, hrvCsvRows } from "./hrv-import";

/**
 * Importa VFC, FC en reposo y sueño. Solo escribe los campos que trae el CSV:
 * el resto del registro del día (control rápido, ánimo…) no se toca.
 */
export async function importHrvCsv(userId: string, text: string, mapping: HrvMapping, commit: boolean) {
  const { rows, errors } = hrvCsvRows(text, mapping);
  if (!commit) return { rows: rows.slice(0, 200), total: rows.length, errors: errors.slice(0, 50) };
  await saveRecoveryRows(userId, rows);
  await updatePrefs(userId, { hrvCsvMapping: mapping });
  return { imported: rows.length, errors: errors.length };
}

type DayFields = { hrvRmssdMs?: number; restingHr?: number; sleepHours?: number };

/**
 * Guarda solo los campos que traen las filas y recalcula el readiness de esos días (O4: en lote).
 * Consultas: 1 lectura de los días que ya existen + 1 alta de los nuevos + 1 UPDATE de los existentes
 * + el readiness en lote (`refreshReadinessRange`), sea cual sea el número de filas.
 */
export async function saveRecoveryRows(userId: string, rows: Array<{ date: string; hrvRmssdMs: number | null; restingHr: number | null; sleepHours: number | null }>) {
  if (!rows.length) return;
  // Misma fecha repetida: gana el último valor de cada campo (como los upserts en orden de antes).
  const byDay = new Map<string, { date: Date; data: DayFields }>();
  for (const r of rows) {
    const date = dateOnly(r.date);
    const key = toIsoDay(date);
    const data = Object.fromEntries(
      Object.entries({ hrvRmssdMs: r.hrvRmssdMs, restingHr: r.restingHr, sleepHours: r.sleepHours }).filter(([, v]) => v != null),
    ) as DayFields;
    const prev = byDay.get(key);
    byDay.set(key, { date, data: { ...prev?.data, ...data } });
  }
  const days = [...byDay.values()];
  const existing = await prisma.recoveryMetrics.findMany({ where: { userId, date: { in: days.map((d) => d.date) } }, select: { id: true, date: true } });
  const idByDay = new Map(existing.map((e) => [toIsoDay(e.date), e.id]));

  const fresh = days.filter((d) => !idByDay.has(toIsoDay(d.date)));
  if (fresh.length) await prisma.recoveryMetrics.createMany({ data: fresh.map((d) => ({ userId, date: d.date, ...d.data })) });

  // Existentes: un solo UPDATE; un campo que no viene (null) conserva su valor.
  const touched = days.filter((d) => idByDay.has(toIsoDay(d.date)) && Object.keys(d.data).length);
  if (touched.length) {
    await prisma.$executeRaw`
      UPDATE "RecoveryMetrics" AS r
      SET "hrvRmssdMs" = COALESCE(v.hrv, r."hrvRmssdMs"), "restingHr" = COALESCE(v.rhr, r."restingHr"),
          "sleepHours" = COALESCE(v.sleep, r."sleepHours"), "updatedAt" = now()
      FROM unnest(
        ${touched.map((d) => idByDay.get(toIsoDay(d.date))!)}::text[],
        ${touched.map((d) => d.data.hrvRmssdMs ?? null)}::float8[],
        ${touched.map((d) => d.data.restingHr ?? null)}::int[],
        ${touched.map((d) => d.data.sleepHours ?? null)}::float8[]
      ) AS v(id, hrv, rhr, sleep)
      WHERE r.id = v.id AND r."userId" = ${userId}`;
  }

  // El readiness de cada día usa la línea base de los anteriores (sin el readiness): se puede calcular todo de una vez.
  const dates = days.map((d) => d.date).sort((a, b) => a.getTime() - b.getTime());
  await refreshReadinessRange(userId, dates[0], dates.at(-1)!, { dates });
}
