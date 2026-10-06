import { z } from "zod";

/**
 * Ciclo menstrual: cálculo de la fase en local (nunca se envía a la IA).
 * Base: el efecto del ciclo en el rendimiento es pequeño y muy individual
 * (McNulty et al. 2020, metaanálisis), así que la app no cambia el plan por
 * fases: propone la «versión suave» del día cuando hay síntomas hoy o cuando
 * la usuaria ha dicho que en esa parte del ciclo suele encontrarse peor.
 */
export const SYMPTOMS = {
  dolor: "Dolor / calambres",
  fatiga: "Fatiga",
  migrana: "Dolor de cabeza / migraña",
  hinchazon: "Hinchazón",
  sueno: "Dormí mal",
  animo: "Ánimo bajo",
} as const;
export const CYCLE_PARTS = {
  regla: "Durante la regla",
  antes: "Los días antes de la regla",
  ovulacion: "Hacia la mitad del ciclo",
} as const;
export type Symptom = keyof typeof SYMPTOMS;
export type CyclePart = keyof typeof CYCLE_PARTS;

const sym = z.enum(Object.keys(SYMPTOMS) as [Symptom, ...Symptom[]]);

export const cycleSettingsSchema = z.object({
  avgLength: z.number().int().min(21).max(45),
  periodDays: z.number().int().min(2).max(8),
  lastStart: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
  hormonal: z.enum(["si", "no", "nd"]),
  symptoms: z.array(sym).max(6),
  symptomParts: z.array(z.enum(Object.keys(CYCLE_PARTS) as [CyclePart, ...CyclePart[]])).max(3),
});
export type CycleSettings = z.infer<typeof cycleSettingsSchema>;

export const cycleLogSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  period: z.boolean(),
  symptoms: z.array(sym).max(6),
});
export type CycleLogEntry = z.infer<typeof cycleLogSchema>;

export type CyclePhase = {
  /** Día del ciclo (1 = primer día de regla) o null si no se puede estimar. */
  day: number | null;
  length: number;
  part: "regla" | "folicular" | "ovulacion" | "lutea" | "antes" | null;
  /** true si la parte se estima (no hay registro de ese día). */
  estimated: boolean;
};

const DAY = 864e5;
const ms = (iso: string) => Date.parse(`${iso}T00:00:00Z`);

/** Inicios de regla: días con regla cuyo día anterior no la tenía, más el último inicio declarado. */
export function periodStarts(settings: Pick<CycleSettings, "lastStart">, logs: CycleLogEntry[]): string[] {
  const period = new Set(logs.filter((l) => l.period).map((l) => l.date));
  const starts = new Set<string>();
  for (const d of period) {
    const prev = new Date(ms(d) - DAY).toISOString().slice(0, 10);
    if (!period.has(prev)) starts.add(d);
  }
  if (settings.lastStart) starts.add(settings.lastStart);
  // Un inicio declarado a 1-3 días de uno registrado es el mismo ciclo: se queda el registrado.
  const sorted = [...starts].sort();
  return sorted.filter((d, i) => i === 0 || (ms(d) - ms(sorted[i - 1])) / DAY > 3);
}

/** Duración media de los últimos ciclos registrados (21-45 días) o la declarada. */
export function cycleLength(settings: Pick<CycleSettings, "avgLength" | "lastStart">, logs: CycleLogEntry[]): number {
  const starts = periodStarts(settings, logs);
  const gaps: number[] = [];
  for (let i = 1; i < starts.length; i++) {
    const g = Math.round((ms(starts[i]) - ms(starts[i - 1])) / DAY);
    if (g >= 21 && g <= 45) gaps.push(g);
  }
  const recent = gaps.slice(-6);
  return recent.length >= 2 ? Math.round(recent.reduce((a, b) => a + b, 0) / recent.length) : settings.avgLength;
}

export function cyclePhase(date: string, settings: CycleSettings, logs: CycleLogEntry[]): CyclePhase {
  const length = cycleLength(settings, logs);
  const today = logs.find((l) => l.date === date);
  if (today?.period) return { day: null, length, part: "regla", estimated: false };
  // Con anticonceptivo hormonal no hay ciclo natural que estimar.
  if (settings.hormonal === "si") return { day: null, length, part: null, estimated: true };
  const start = periodStarts(settings, logs)
    .filter((d) => d <= date)
    .at(-1);
  if (!start) return { day: null, length, part: null, estimated: true };
  const day = Math.floor((ms(date) - ms(start)) / DAY) + 1;
  // Más de 1,5 ciclos sin registrar: la estimación ya no es fiable.
  if (day > Math.round(length * 1.5)) return { day: null, length, part: null, estimated: true };
  const d = ((day - 1) % length) + 1;
  const ovulation = length - 14;
  const part: CyclePhase["part"] =
    d <= settings.periodDays ? "regla" : d >= ovulation - 1 && d <= ovulation + 1 ? "ovulacion" : d > length - 5 ? "antes" : d < ovulation ? "folicular" : "lutea";
  return { day: d, length, part, estimated: true };
}

/** ¿Proponer hoy la versión suave? Devuelve el motivo o null. */
export function suggestLight(date: string, settings: CycleSettings | null, logs: CycleLogEntry[]): string | null {
  const today = logs.find((l) => l.date === date);
  if (today?.symptoms.length) return "Hoy has marcado síntomas";
  if (!settings) return null;
  const { part } = cyclePhase(date, settings, logs);
  if (part === "regla" && settings.symptomParts.includes("regla")) return "Sueles encontrarte peor durante la regla";
  if (part === "antes" && settings.symptomParts.includes("antes")) return "Sueles encontrarte peor los días antes de la regla";
  if (part === "ovulacion" && settings.symptomParts.includes("ovulacion")) return "Sueles encontrarte peor hacia la mitad del ciclo";
  return null;
}

export const PART_LABEL: Record<NonNullable<CyclePhase["part"]>, string> = {
  regla: "Regla",
  folicular: "Fase folicular",
  ovulacion: "Hacia la ovulación",
  lutea: "Fase lútea",
  antes: "Días antes de la regla",
};
