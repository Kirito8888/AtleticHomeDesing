// Antropometría (v1.6): perímetros (cm) y pliegues (mm). Puro. Solo los ve su dueño.
import { z } from "zod";

import { isoDate } from "@/lib/dates";

export const GIRTHS = { brazo: "Brazo relajado", brazoTenso: "Brazo contraído", pecho: "Pecho", cintura: "Cintura", cadera: "Cadera", muslo: "Muslo", gemelo: "Gemelo" } as const;
export const SKINFOLDS = { triceps: "Tríceps", subescapular: "Subescapular", supraespinal: "Supraespinal", abdominal: "Abdominal", muslo: "Muslo", gemelo: "Gemelo" } as const;
export type Girth = keyof typeof GIRTHS;
export type Skinfold = keyof typeof SKINFOLDS;

export const bodyMeasureSchema = z
  .object({
    date: isoDate,
    girths: z.partialRecord(z.enum(Object.keys(GIRTHS) as [Girth, ...Girth[]]), z.number().min(10).max(250)).default({}),
    skinfolds: z.partialRecord(z.enum(Object.keys(SKINFOLDS) as [Skinfold, ...Skinfold[]]), z.number().min(2).max(80)).default({}),
  })
  .refine((m) => Object.keys(m.girths).length + Object.keys(m.skinfolds).length > 0, "Apunta al menos una medida");
export type BodyMeasureInput = z.infer<typeof bodyMeasureSchema>;

/** Suma de los 6 pliegues (solo si están todos: si no, no es comparable). */
export function skinfoldSum(s: Partial<Record<Skinfold, number>>): number | null {
  const keys = Object.keys(SKINFOLDS) as Skinfold[];
  return keys.every((k) => s[k] != null) ? Math.round(keys.reduce((a, k) => a + s[k]!, 0) * 10) / 10 : null;
}

/** Cambio de cada medida entre la primera y la última toma en que aparece. */
export function measureChanges(rows: Array<{ date: string; girths: Partial<Record<Girth, number>>; skinfolds: Partial<Record<Skinfold, number>> }>) {
  const sorted = [...rows].sort((a, b) => a.date.localeCompare(b.date));
  const change = (get: (r: (typeof rows)[number]) => number | undefined) => {
    const xs = sorted.flatMap((r) => (get(r) != null ? [{ date: r.date, v: get(r)! }] : []));
    return xs.length >= 2 ? { from: xs[0], to: xs.at(-1)!, diff: Math.round((xs.at(-1)!.v - xs[0].v) * 10) / 10 } : null;
  };
  return {
    girths: (Object.keys(GIRTHS) as Girth[]).flatMap((k) => {
      const c = change((r) => r.girths[k]);
      return c ? [{ key: k, label: GIRTHS[k], ...c }] : [];
    }),
    skinfoldSum: change((r) => skinfoldSum(r.skinfolds) ?? undefined),
  };
}
