import { z } from "zod";

import { localDay } from "@/lib/dates";

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

/** Diferencia máxima que se considera «el mismo valor» (redondeo del reloj, de la báscula o de quien anota). */
export const TOLERANCE: Record<HealthKey, number> = { sleepHours: 0.1, hrvSdnnMs: 1, restingHr: 1, bodyWeightKg: 0.1 };

/** Compara con tolerancia (con holgura de coma flotante). */
export function sameValue(key: HealthKey, a: number, b: number): boolean {
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

const num = (min: number, max: number) =>
  z.preprocess(
    (v) => (typeof v === "string" && v.trim() !== "" ? Number(v.trim().replace(",", ".")) : v === "" ? undefined : v),
    z.number().finite().min(min).max(max).nullish(),
  );

const DAY_MS = 86_400_000;

/** «2026-11-22» o un ISO con hora (→ día en Madrid). */
const dayField = z
  .string()
  .trim()
  .transform((s, ctx) => {
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return Number.isNaN(Date.parse(`${s}T00:00:00Z`)) ? (ctx.addIssue({ code: "custom", message: "Fecha inválida" }), z.NEVER) : s;
    const t = Date.parse(s);
    if (Number.isNaN(t) || !/^\d{4}-\d{2}-\d{2}T/.test(s)) {
      ctx.addIssue({ code: "custom", message: "Fecha: AAAA-MM-DD o ISO con hora" });
      return z.NEVER;
    }
    return localDay(new Date(t));
  });

export const healthDaySchema = z
  .object({
    date: dayField,
    sleepHours: num(0, 24),
    sleepMin: num(0, 1440),
    hrvSdnnMs: num(1, 300),
    restingHr: num(25, 150),
    weightKg: num(25, 300),
  })
  .refine((d) => d.sleepHours != null || d.sleepMin != null || d.hrvSdnnMs != null || d.restingHr != null || d.weightKg != null, {
    message: "No hay ninguna métrica (sleepHours, hrvSdnnMs, restingHr o weightKg)",
  })
  .refine((d) => Date.parse(`${d.date}T00:00:00Z`) <= Date.now() + DAY_MS, { message: "La fecha está en el futuro", path: ["date"] })
  .transform((d) => ({
    date: d.date,
    sleepHours: d.sleepHours ?? (d.sleepMin != null ? Math.round((d.sleepMin / 60) * 100) / 100 : null),
    hrvSdnnMs: d.hrvSdnnMs ?? null,
    restingHr: d.restingHr != null ? Math.round(d.restingHr) : null,
    bodyWeightKg: d.weightKg ?? null,
  }));

export type HealthDay = z.infer<typeof healthDaySchema>;

/** Un día o `{ days: [...] }` (hasta 14). Los días repetidos se fusionan: gana el último valor de cada métrica. */
export const healthPayloadSchema = z
  .union([healthDaySchema.transform((d) => [d]), z.object({ days: z.array(healthDaySchema).min(1).max(14) }).transform((b) => b.days)])
  .transform((days) => {
    const by = new Map<string, HealthDay>();
    for (const d of days) {
      const prev = by.get(d.date);
      by.set(d.date, prev ? ({ ...prev, ...Object.fromEntries(Object.entries(d).filter(([, v]) => v != null)) } as HealthDay) : d);
    }
    return [...by.values()];
  });
