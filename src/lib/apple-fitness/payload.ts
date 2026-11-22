import { z } from "zod";

import { parseAppleInstant, quantity, withBareUnit } from "@/lib/integrations/apple-units";

/**
 * v3.1 · Cuerpo que envía el Atajo de iOS. Tolerante con lo que da Atajos: números o texto con coma, y (Bloque C) texto con
 * unidad («7,2 km», «2008 kJ», «1 h 5 min»); fechas ISO con o sin desfase (sin desfase = hora de Madrid) o «AAAA-MM-DD HH:mm:ss ±hhmm».
 * Con topes de rango: nada fuera de lo humano entra en la bandeja.
 */
const instant = z
  .string()
  .trim()
  .transform((s, ctx) => {
    const d = parseAppleInstant(s);
    if (!d) {
      ctx.addIssue({ code: "custom", message: "Fecha: ISO 8601 (con o sin zona) o «AAAA-MM-DD HH:mm:ss ±hhmm»" });
      return z.NEVER;
    }
    return d.toISOString();
  });
const DAY_MS = 86_400_000;

/** Cada magnitud admite varios nombres de campo; si llegan dos, gana el de la unidad canónica. */
export const workoutSchema = z
  .object({
    /** Tipo de actividad tal como lo da Salud/Fitness (en el idioma del iPhone). */
    type: z.string().trim().min(1).max(60),
    name: z.string().trim().max(120).nullish(),
    start: instant,
    end: instant.nullish(),
    durationMin: quantity("min", 0.5, 1440),
    durationSec: quantity("s", 30, 86_400),
    duration: quantity("s", 30, 86_400),
    distanceKm: quantity("km", 0, 1000),
    distanceM: quantity("m", 0, 1_000_000),
    distance: quantity("m", 0, 1_000_000),
    hrAvg: quantity("bpm", 30, 250),
    hrMax: quantity("bpm", 30, 250),
    kcal: quantity("kcal", 0, 20_000),
    /** Un número desnudo aquí son kJ (Salud da la energía en kJ si el iPhone está en unidades métricas «energía»). */
    /** Un número desnudo aquí son kJ. */
    energyKj: z.unknown().transform(withBareUnit("kJ")).pipe(quantity("kcal", 0, 20_000)).optional(),
    energy: quantity("kcal", 0, 20_000),
  })
  .transform(({ duration, distance, energy, energyKj, ...w }) => ({
    ...w,
    durationSec: w.durationSec ?? duration ?? null,
    distanceM: w.distanceM ?? distance ?? null,
    kcal: w.kcal ?? energyKj ?? energy ?? null,
  }))
  .refine((w) => w.durationSec != null || w.durationMin != null || w.end != null, { message: "Falta la duración (durationMin, durationSec, duration o end)" })
  .refine((w) => w.hrAvg == null || w.hrMax == null || w.hrMax >= w.hrAvg, { message: "hrMax no puede ser menor que hrAvg" })
  .refine((w) => new Date(w.start).getTime() <= Date.now() + DAY_MS, { message: "El inicio está en el futuro", path: ["start"] })
  .refine((w) => !w.end || new Date(w.end) > new Date(w.start), { message: "end debe ser posterior a start", path: ["end"] });

export type WorkoutInput = z.infer<typeof workoutSchema>;

/** Un entreno o `{ workouts: [...] }` (hasta 50: un Atajo «enviar los de hoy» o un reenvío). */
export const payloadSchema = z.union([
  workoutSchema.transform((w) => [w]),
  z.object({ workouts: z.array(workoutSchema).min(1).max(50) }).transform((b) => b.workouts),
]);
