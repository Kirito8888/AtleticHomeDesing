import { z } from "zod";

import { isoDate } from "@/lib/dates";

export const reviewSchema = z.object({
  weekStart: isoDate,
  wentWell: z.string().trim().max(500).nullish(),
  change: z.string().trim().max(500).nullish(),
  focus: z.string().trim().max(120).nullish(),
});
export type ReviewInput = z.infer<typeof reviewSchema>;

export type WeekSummary = { sessions: number; tss: number; sleepH: number | null; studyMin: number; spentCents: number };

/** Frases cortas del resumen (sin datos de salud cifrados: solo carga, sueño medio, estudio y gasto). */
export function summaryLines(s: WeekSummary, prev: WeekSummary | null): string[] {
  const delta = (a: number, b: number | undefined) => (b == null || b === 0 ? "" : ` (${a >= b ? "+" : ""}${Math.round(((a - b) / b) * 100)} % vs. la anterior)`);
  return [
    `${s.sessions} ${s.sessions === 1 ? "sesión" : "sesiones"} · TSS ${Math.round(s.tss)}${delta(s.tss, prev?.tss)}`,
    s.sleepH != null ? `Sueño medio: ${s.sleepH.toFixed(1)} h` : "Sin registros de sueño",
    `Estudio: ${Math.floor(s.studyMin / 60)} h ${s.studyMin % 60} min${delta(s.studyMin, prev?.studyMin)}`,
    `Gasto: ${(s.spentCents / 100).toLocaleString("es-ES", { style: "currency", currency: "EUR" })}`,
  ];
}
