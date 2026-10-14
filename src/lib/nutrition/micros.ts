/**
 * v1.10 · Micronutrientes. Valores de referencia generales para adultos de la EFSA (Dietary Reference
 * Values, 2015–2019: PRI o AI según el nutriente) como punto de partida; cada persona los cambia en
 * Nutrición → Micronutrientes. No son recomendaciones médicas ni personales.
 */
export const MICROS = ["ironMg", "calciumMg", "vitDUg", "b12Ug", "magnesiumMg", "sodiumMg", "potassiumMg"] as const;
export type Micro = (typeof MICROS)[number];

export const MICRO_INFO: Record<Micro, { label: string; unit: "mg" | "µg"; per100: string; ref: { female: number; male: number }; kind: "min" | "max" }> = {
  ironMg: { label: "Hierro", unit: "mg", per100: "ironPer100g", ref: { female: 16, male: 11 }, kind: "min" },
  calciumMg: { label: "Calcio", unit: "mg", per100: "calciumPer100g", ref: { female: 950, male: 950 }, kind: "min" },
  vitDUg: { label: "Vitamina D", unit: "µg", per100: "vitDPer100g", ref: { female: 15, male: 15 }, kind: "min" },
  b12Ug: { label: "Vitamina B12", unit: "µg", per100: "b12Per100g", ref: { female: 4, male: 4 }, kind: "min" },
  magnesiumMg: { label: "Magnesio", unit: "mg", per100: "magnesiumPer100g", ref: { female: 300, male: 350 }, kind: "min" },
  // Sodio: ingesta «segura y adecuada» de la EFSA (2019); se vigila que no se pase
  sodiumMg: { label: "Sodio", unit: "mg", per100: "sodiumPer100g", ref: { female: 2000, male: 2000 }, kind: "max" },
  potassiumMg: { label: "Potasio", unit: "mg", per100: "potassiumPer100g", ref: { female: 3500, male: 3500 }, kind: "min" },
};

export const MICRO_SOURCE = "EFSA, Dietary Reference Values for nutrients (2015–2019)";

type Per100 = { [k: string]: unknown };

/** Micronutrientes de una toma a partir de los valores por 100 g del alimento. */
export function microsForQuantity(food: Per100, quantityG: number): Record<Micro, number | null> {
  const out = {} as Record<Micro, number | null>;
  for (const m of MICROS) {
    const v = food[MICRO_INFO[m].per100];
    out[m] = typeof v === "number" ? Math.round(v * quantityG) / 100 : null;
  }
  return out;
}

/** Objetivos efectivos: los de la persona o, si no los puso, los de referencia según el sexo del perfil. */
export function microTargets(custom: Partial<Record<Micro, number>> | undefined, sex: "FEMALE" | "MALE" | string | null | undefined): Record<Micro, number> {
  const k = sex === "MALE" ? "male" : "female";
  return Object.fromEntries(MICROS.map((m) => [m, custom?.[m] ?? MICRO_INFO[m].ref[k]])) as Record<Micro, number>;
}

/**
 * Media diaria de los últimos días frente al objetivo. Solo cuenta los días con algo anotado y dice
 * qué parte de lo anotado trae el dato (muchos alimentos no lo traen: la media sería engañosa).
 */
export function microSummary(entries: Array<Partial<Record<Micro, number | null>> & { date: Date | string }>, targets: Record<Micro, number>) {
  const days = new Set(entries.map((e) => String(e.date instanceof Date ? e.date.toISOString().slice(0, 10) : e.date))).size || 1;
  return MICROS.map((m) => {
    const known = entries.filter((e) => e[m] != null);
    const total = known.reduce((a, e) => a + (e[m] ?? 0), 0);
    const avg = Math.round((total / days) * 10) / 10;
    return { micro: m, ...MICRO_INFO[m], avg, target: targets[m], pct: targets[m] ? Math.round((avg / targets[m]) * 100) : null, coverage: entries.length ? Math.round((known.length / entries.length) * 100) : 0 };
  });
}
