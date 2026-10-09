import { z } from "zod";

/** Batería de tests físicos habituales en lanzamientos (y propios). */
export const TEST_CATALOG = {
  sprint30: { name: "30 m lanzados o desde parado", unit: "s", higherIsBetter: false },
  sprint60: { name: "60 m", unit: "s", higherIsBetter: false },
  standingLong: { name: "Salto horizontal a pies juntos", unit: "m", higherIsBetter: true },
  standingTriple: { name: "Triple desde parado", unit: "m", higherIsBetter: true },
  medBallBack: { name: "Balón medicinal atrás por encima de la cabeza", unit: "m", higherIsBetter: true },
  medBallFront: { name: "Balón medicinal adelante (pecho o por encima)", unit: "m", higherIsBetter: true },
  cmj: { name: "Salto con contramovimiento (CMJ)", unit: "cm", higherIsBetter: true },
  pullUps: { name: "Dominadas máximas", unit: "reps", higherIsBetter: true },
} as const;
export type CatalogTest = keyof typeof TEST_CATALOG;

export const testResultSchema = z
  .object({
    test: z.string().min(1).max(40), // clave del catálogo o «custom»
    customName: z.string().trim().min(1).max(60).nullish(),
    customUnit: z.string().trim().min(1).max(10).nullish(),
    customHigherIsBetter: z.boolean().nullish(),
    value: z.number().positive().max(100_000),
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    notes: z.string().max(200).nullish(),
  })
  .refine((t) => t.test in TEST_CATALOG || (t.test === "custom" && t.customName && t.customUnit), "Elige un test o pon nombre y unidad");

const slug = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

/** Resuelve la definición del test (clave estable, nombre, unidad y sentido). */
export function testDefinition(t: z.infer<typeof testResultSchema>) {
  if (t.test in TEST_CATALOG) {
    const c = TEST_CATALOG[t.test as CatalogTest];
    return { testKey: t.test, name: c.name, unit: c.unit, higherIsBetter: c.higherIsBetter };
  }
  return { testKey: `custom:${slug(t.customName!)}`, name: t.customName!, unit: t.customUnit!, higherIsBetter: t.customHigherIsBetter ?? true };
}

export type TestRow = { id: string; testKey: string; name: string; unit: string; higherIsBetter: boolean; value: number; date: string };
export type TestSummary = { testKey: string; name: string; unit: string; higherIsBetter: boolean; best: TestRow; last: TestRow; changePct: number | null; series: Array<{ date: string; value: number }> };

/** Resumen por test: mejor, último y cambio del último frente al anterior (positivo = mejora). */
export function summarizeTests(rows: TestRow[]): TestSummary[] {
  const by = new Map<string, TestRow[]>();
  for (const r of rows) by.set(r.testKey, [...(by.get(r.testKey) ?? []), r]);
  return [...by.values()]
    .map((list) => {
      const sorted = [...list].sort((a, b) => (a.date < b.date ? -1 : 1));
      const hib = sorted[0].higherIsBetter;
      const best = sorted.reduce((a, b) => ((hib ? b.value > a.value : b.value < a.value) ? b : a));
      const last = sorted.at(-1)!;
      const prev = sorted.at(-2);
      const raw = prev ? ((last.value - prev.value) / prev.value) * 100 : null;
      return {
        testKey: last.testKey,
        name: last.name,
        unit: last.unit,
        higherIsBetter: hib,
        best,
        last,
        changePct: raw == null ? null : Math.round((hib ? raw : -raw) * 10) / 10,
        series: sorted.map((r) => ({ date: r.date, value: r.value })),
      };
    })
    .sort((a, b) => (a.last.date < b.last.date ? 1 : -1));
}
