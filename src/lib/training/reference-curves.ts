import { z } from "zod";

/** v2.1 · Curvas de referencia publicadas (tabuladas a mano) y su superposición con los tests de la atleta. Puro. */

export const pointSchema = z.object({
  x: z.number().min(0).max(120), // edad en años
  p50: z.number().positive().max(100_000),
  low: z.number().positive().max(100_000).optional(),
  high: z.number().positive().max(100_000).optional(),
});
export type CurvePoint = z.infer<typeof pointSchema>;

export const pointsSchema = z
  .array(pointSchema)
  .min(2, "Hacen falta al menos 2 puntos")
  .max(60)
  .superRefine((pts, ctx) => {
    pts.forEach((p, i) => {
      if (i > 0 && p.x <= pts[i - 1].x) ctx.addIssue({ code: "custom", message: `La edad del punto ${i + 1} debe ser mayor que la anterior` });
      if (p.low !== undefined && p.low > p.p50) ctx.addIssue({ code: "custom", message: `Punto ${i + 1}: «bajo» no puede superar la mediana` });
      if (p.high !== undefined && p.high < p.p50) ctx.addIssue({ code: "custom", message: `Punto ${i + 1}: «alto» no puede ser menor que la mediana` });
    });
  });

const DOI = /^10\.\d{4,9}\/\S+$/;
const optional = (s: z.ZodString) => z.preprocess((v) => (typeof v === "string" && v.trim() === "" ? undefined : v), s.optional());

/** Alta de curva: la atribución (estudio, autores, año, cita) es obligatoria. */
export const curveInputSchema = z.object({
  testKey: z.string().min(1).max(60),
  unit: z.string().trim().min(1).max(10),
  higherIsBetter: z.boolean(),
  title: z.string().trim().min(3).max(120),
  sex: z.enum(["MALE", "FEMALE", "OTHER"]).nullish(),
  level: z.string().trim().max(60).nullish(),
  discipline: z.enum(["SPRINT", "MIDDLE_DISTANCE", "LONG_DISTANCE", "HURDLES", "JUMPS", "THROWS", "COMBINED_EVENTS", "SWIMMING", "CYCLING", "STRENGTH", "OTHER"]).nullish(),
  study: z.string().trim().min(3, "Falta el estudio").max(200),
  authors: z.string().trim().min(2, "Faltan los autores").max(200),
  year: z.number().int().min(1900).max(2100),
  citation: z.string().trim().min(10, "Falta la cita completa").max(500),
  doi: optional(z.string().trim().regex(DOI, "DOI no válido (formato 10.xxxx/…)")),
  sourceUrl: optional(z.string().trim().url().max(300).refine((u) => /^https:\/\//.test(u), "Solo https")),
  points: pointsSchema,
});
export type CurveInput = z.infer<typeof curveInputSchema>;

/** «edad;p50;bajo;alto» por línea (bajo y alto opcionales; admite coma decimal). */
export function parsePointsText(text: string): CurvePoint[] {
  const num = (s: string) => Number(s.trim().replace(",", "."));
  return text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
    .map((line, i) => {
      const parts = line.split(";");
      if (parts.length < 2 || parts.length > 4) throw new Error(`Línea ${i + 1}: usa edad;mediana;bajo;alto`);
      const [x, p50, low, high] = parts.map((p, k) => (k >= 2 && p.trim() === "" ? undefined : num(p)));
      if ([x, p50].some((n) => n === undefined || !Number.isFinite(n)) || [low, high].some((n) => n !== undefined && !Number.isFinite(n))) throw new Error(`Línea ${i + 1}: hay un valor que no es un número`);
      return { x: x!, p50: p50!, ...(low !== undefined ? { low } : {}), ...(high !== undefined ? { high } : {}) };
    });
}

/** Años decimales (365,25 d) entre el nacimiento y la fecha, ambos AAAA-MM-DD. */
export function ageAt(birthDate: string, date: string): number {
  return (Date.parse(`${date}T00:00:00Z`) - Date.parse(`${birthDate}T00:00:00Z`)) / (365.25 * 86_400_000);
}

/** Interpolación lineal de la curva en x. Sin extrapolar: fuera del rango tabulado → null. */
export function interpolate(points: CurvePoint[], x: number): { p50: number; low: number | null; high: number | null } | null {
  if (points.length < 2 || x < points[0].x || x > points[points.length - 1].x) return null;
  let i = points.findIndex((p) => p.x >= x);
  if (i === 0) i = 1;
  const a = points[i - 1];
  const b = points[i];
  const t = (x - a.x) / (b.x - a.x);
  const mix = (u: number | undefined, v: number | undefined) => (u === undefined || v === undefined ? null : u + (v - u) * t);
  return { p50: a.p50 + (b.p50 - a.p50) * t, low: mix(a.low, b.low), high: mix(a.high, b.high) };
}

export type Band = "above" | "within" | "below" | "outside";
export interface OverlayRow {
  date: string;
  age: number;
  value: number;
  ref: number | null;
  low: number | null;
  high: number | null;
  /** % frente a la mediana; positivo = mejor que la referencia (según el sentido del test). */
  deltaPct: number | null;
  band: Band;
}

/** Superpone los resultados de la atleta a la curva. `above` = mejor que la banda, `below` = peor. */
export function overlay(results: Array<{ date: string; value: number }>, curve: { points: CurvePoint[]; higherIsBetter: boolean }, birthDate: string): OverlayRow[] {
  return results.map((r) => {
    const age = ageAt(birthDate, r.date);
    const at = interpolate(curve.points, age);
    if (!at) return { date: r.date, age, value: r.value, ref: null, low: null, high: null, deltaPct: null, band: "outside" as const };
    const sign = curve.higherIsBetter ? 1 : -1;
    const deltaPct = ((r.value - at.p50) / at.p50) * 100 * sign;
    // low/high son los extremos de la banda de la tabla (low ≤ p50 ≤ high), da igual el sentido del test
    let band: Band = "within";
    if (at.low !== null && at.high !== null) {
      const better = curve.higherIsBetter ? r.value > at.high : r.value < at.low;
      const worse = curve.higherIsBetter ? r.value < at.low : r.value > at.high;
      band = better ? "above" : worse ? "below" : "within";
    } else band = deltaPct > 0 ? "above" : deltaPct < 0 ? "below" : "within";
    return { date: r.date, age, value: r.value, ref: at.p50, low: at.low, high: at.high, deltaPct, band };
  });
}

export function summarizeOverlay(rows: OverlayRow[]) {
  const comparable = rows.filter((r) => r.deltaPct !== null);
  const last = comparable[comparable.length - 1] ?? null;
  const mean = comparable.length ? comparable.reduce((s, r) => s + r.deltaPct!, 0) / comparable.length : null;
  return { comparable: comparable.length, outside: rows.length - comparable.length, last, meanDeltaPct: mean };
}
