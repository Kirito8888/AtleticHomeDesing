import { z } from "zod";

/**
 * v3.1 · Cuerpo que envía el Atajo de iOS. Tolerante con lo que da Atajos (números o texto con coma,
 * minutos o segundos, km o metros) pero con topes de rango: nada fuera de lo humano entra en la bandeja.
 */
const num = (min: number, max: number) =>
  z.preprocess(
    (v) => (typeof v === "string" && v.trim() !== "" ? Number(v.trim().replace(",", ".")) : v === "" ? undefined : v),
    z.number().finite().min(min).max(max).nullish(),
  );

const iso = z.iso.datetime({ offset: true });
const DAY_MS = 86_400_000;

export const workoutSchema = z
  .object({
    /** Tipo de actividad tal como lo da Salud/Fitness (en el idioma del iPhone). */
    type: z.string().trim().min(1).max(60),
    name: z.string().trim().max(120).nullish(),
    start: iso,
    end: iso.nullish(),
    durationMin: num(0.5, 1440),
    durationSec: num(30, 86_400),
    distanceKm: num(0, 1000),
    distanceM: num(0, 1_000_000),
    hrAvg: num(30, 250),
    hrMax: num(30, 250),
    kcal: num(0, 20_000),
  })
  .refine((w) => w.durationSec != null || w.durationMin != null || w.end != null, { message: "Falta la duración (durationMin, durationSec o end)" })
  .refine((w) => w.hrAvg == null || w.hrMax == null || w.hrMax >= w.hrAvg, { message: "hrMax no puede ser menor que hrAvg" })
  .refine((w) => new Date(w.start).getTime() <= Date.now() + DAY_MS, { message: "El inicio está en el futuro", path: ["start"] })
  .refine((w) => !w.end || new Date(w.end) > new Date(w.start), { message: "end debe ser posterior a start", path: ["end"] });

export type WorkoutInput = z.infer<typeof workoutSchema>;

/** Un entreno o `{ workouts: [...] }` (hasta 50: un Atajo «enviar los de hoy» o un reenvío). */
export const payloadSchema = z.union([
  workoutSchema.transform((w) => [w]),
  z.object({ workouts: z.array(workoutSchema).min(1).max(50) }).transform((b) => b.workouts),
]);
