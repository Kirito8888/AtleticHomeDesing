import { z } from "zod";

import { localDay } from "@/lib/dates";
import { parseAppleInstant, quantity, withBareUnit } from "@/lib/integrations/apple-units";

/**
 * v3.1 · Bloque B · Sincronización diaria de Apple Salud (sueño, VFC, FC en reposo, peso). Puro: sin BD.
 * La VFC de Apple es SDNN (no rMSSD): va a su propio campo y nunca se compara con la rMSSD anotada.
 */

export type HealthKey = "sleepHours" | "hrvSdnnMs" | "restingHr" | "bodyWeightKg";
export const HEALTH_KEYS: HealthKey[] = ["sleepHours", "hrvSdnnMs", "restingHr", "bodyWeightKg"];

export const METRIC_OF: Record<HealthKey, "SLEEP_HOURS" | "HRV_SDNN" | "RESTING_HR" | "BODY_WEIGHT"> = {
  sleepHours: "SLEEP_HOURS",
  hrvSdnnMs: "HRV_SDNN",
  restingHr: "RESTING_HR",
  bodyWeightKg: "BODY_WEIGHT",
};
export const KEY_OF = Object.fromEntries(Object.entries(METRIC_OF).map(([k, v]) => [v, k])) as Record<string, HealthKey>;

export const METRIC_LABEL: Record<string, string> = {
  SLEEP_HOURS: "Sueño",
  HRV_SDNN: "VFC (SDNN)",
  RESTING_HR: "FC en reposo",
  BODY_WEIGHT: "Peso",
};
export const METRIC_UNIT: Record<string, string> = { SLEEP_HOURS: "h", HRV_SDNN: "ms", RESTING_HR: "lpm", BODY_WEIGHT: "kg" };

/**
 * Diferencia máxima que se considera «el mismo valor» (v3.1 C: ajustada a la resolución real de cada medida, para no perder
 * cambios reales): sueño ±1 min, peso ±0,05 kg, FC en reposo ±1 lpm, VFC ±1 ms.
 */
export const TOLERANCE: Record<HealthKey, number> = { sleepHours: 1 / 60, hrvSdnnMs: 1, restingHr: 1, bodyWeightKg: 0.05 };

/** Compara con tolerancia (con holgura de coma flotante). */
export function sameValue(key: HealthKey, a: number, b: number): boolean {
  // El sueño se guarda en horas con 4 decimales: se compara en minutos enteros para que «±1 min» sea exacto
  if (key === "sleepHours") return Math.abs(Math.round(a * 60) - Math.round(b * 60)) <= 1;
  return Math.abs(a - b) <= TOLERANCE[key] + 1e-9;
}

export type Decision = "write" | "keep" | "conflict";

/**
 * Qué hacer con un valor recibido.
 * - Campo vacío → `write`.
 * - Igual al actual (con tolerancia) → `keep` (se conserva el existente, sin aviso).
 * - El actual sigue siendo lo que puso Apple la última vez (la usuaria no lo tocó) → `write` (corrección de Apple).
 * - Si no → `conflict`: no se sobrescribe un dato anotado.
 */
export function decide(key: HealthKey, current: number | null | undefined, incoming: number, lastApple?: number | null): Decision {
  if (current == null) return "write";
  if (sameValue(key, current, incoming)) return "keep";
  if (lastApple != null && sameValue(key, current, lastApple)) return "write";
  return "conflict";
}

const DAY_MS = 86_400_000;

/** «2026-11-22» o un ISO con hora (con o sin zona; sin zona = Madrid) → día en Madrid. */
const dayField = z
  .string()
  .trim()
  .transform((s, ctx) => {
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return Number.isNaN(Date.parse(`${s}T00:00:00Z`)) ? (ctx.addIssue({ code: "custom", message: "Fecha inválida" }), z.NEVER) : s;
    const d = parseAppleInstant(s);
    if (!d) {
      ctx.addIssue({ code: "custom", message: "Fecha: AAAA-MM-DD o ISO con hora" });
      return z.NEVER;
    }
    return localDay(d);
  });

const instantField = z
  .string()
  .trim()
  .transform((s, ctx) => {
    const d = parseAppleInstant(s);
    if (!d) {
      ctx.addIssue({ code: "custom", message: "Fecha y hora: ISO 8601 (con o sin zona) o «AAAA-MM-DD HH:mm:ss ±hhmm»" });
      return z.NEVER;
    }
    return d;
  });

const r = (n: number, dec: number) => Math.round(n * 10 ** dec) / 10 ** dec;
/** El sueño se guarda a minuto entero, en horas. */
const sleepFromMin = (min: number) => r(Math.round(min) / 60, 4);

/**
 * Un día del Atajo → 1 o 2 días. El sueño cuenta para el día en que te despiertas (`sleepEnd`): si ese día no es `date`,
 * el sueño se separa a su día y el resto de métricas se queda en `date`.
 */
export const healthDaySchema = z
  .object({
    date: dayField.optional(),
    /** Un número desnudo son HORAS; con unidad («7 h 32 min», «450 min») se respeta. */
    sleepHours: z.unknown().transform(withBareUnit("h")).pipe(quantity("min", 0, 24 * 60)).optional(),
    sleepMin: quantity("min", 0, 1440),
    sleepSec: quantity("s", 0, 86_400),
    sleep: quantity("min", 0, 1440),
    sleepStart: instantField.nullish(),
    sleepEnd: instantField.nullish(),
    hrvSdnnMs: quantity("ms", 1, 300),
    restingHr: quantity("bpm", 25, 150),
    weightKg: quantity("kg", 25, 300),
  })
  .transform((d, ctx) => {
    const rawHours = d.sleepHours;
    let sleepMinutes: number | null = null;
    if (d.sleepMin != null) sleepMinutes = d.sleepMin;
    else if (d.sleepSec != null) sleepMinutes = d.sleepSec / 60;
    else if (d.sleep != null) sleepMinutes = d.sleep;
    else if (rawHours != null) sleepMinutes = rawHours;
    if (sleepMinutes == null && d.sleepStart && d.sleepEnd) sleepMinutes = (d.sleepEnd.getTime() - d.sleepStart.getTime()) / 60_000;
    if (d.sleepStart && d.sleepEnd && d.sleepEnd <= d.sleepStart) {
      ctx.addIssue({ code: "custom", message: "sleepEnd debe ser posterior a sleepStart", path: ["sleepEnd"] });
      return z.NEVER;
    }
    const wake = d.sleepEnd ? localDay(d.sleepEnd) : null;
    const date = d.date ?? wake;
    if (!date) {
      ctx.addIssue({ code: "custom", message: "Falta la fecha (date o sleepEnd)", path: ["date"] });
      return z.NEVER;
    }
    const sleepHours = sleepMinutes != null ? sleepFromMin(sleepMinutes) : null;
    const rest = {
      hrvSdnnMs: d.hrvSdnnMs != null ? r(d.hrvSdnnMs, 1) : null,
      restingHr: d.restingHr != null ? Math.round(d.restingHr) : null,
      bodyWeightKg: d.weightKg != null ? r(d.weightKg, 2) : null,
    };
    const hasRest = rest.hrvSdnnMs != null || rest.restingHr != null || rest.bodyWeightKg != null;
    if (sleepHours == null && !hasRest) {
      ctx.addIssue({ code: "custom", message: "No hay ninguna métrica (sleepHours, hrvSdnnMs, restingHr o weightKg)" });
      return z.NEVER;
    }
    const out: HealthDay[] = [];
    if (sleepHours != null && wake && wake !== date) {
      out.push({ date: wake, sleepHours, hrvSdnnMs: null, restingHr: null, bodyWeightKg: null });
      if (hasRest) out.push({ date, sleepHours: null, ...rest });
    } else out.push({ date, sleepHours, ...rest });
    return out;
  })
  .refine((ds) => ds.every((d) => Date.parse(`${d.date}T00:00:00Z`) <= Date.now() + DAY_MS), { message: "La fecha está en el futuro", path: ["date"] });

export interface HealthDay {
  date: string;
  sleepHours: number | null;
  hrvSdnnMs: number | null;
  restingHr: number | null;
  bodyWeightKg: number | null;
}

/** Fusiona días repetidos: gana el último valor de cada métrica. */
export function mergeHealthDays(days: HealthDay[]): HealthDay[] {
  const by = new Map<string, HealthDay>();
  for (const d of days) {
    const prev = by.get(d.date);
    by.set(d.date, prev ? ({ ...prev, ...Object.fromEntries(Object.entries(d).filter(([, v]) => v != null)) } as HealthDay) : d);
  }
  return [...by.values()];
}

/** Un día o `{ days: [...] }` (hasta 14). Los días repetidos se fusionan: gana el último valor de cada métrica. */
export const healthPayloadSchema = z
  .union([healthDaySchema, z.object({ days: z.array(healthDaySchema).min(1).max(14) }).transform((b) => b.days.flat())])
  .transform(mergeHealthDays);

/** Importación desde fichero (export.xml de Salud, leído en el navegador): hasta 400 días por envío. */
export const healthImportSchema = z
  .object({ days: z.array(healthDaySchema).min(1).max(400) })
  .transform((b) => mergeHealthDays(b.days.flat()));
