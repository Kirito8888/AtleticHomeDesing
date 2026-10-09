// Prehabilitación para lanzadores (v1.6): rutinas plantilla editables y adherencia. Puro.
import { z } from "zod";

export const prehabExerciseSchema = z.object({ name: z.string().trim().min(1).max(80), dose: z.string().trim().max(40) });
export const prehabRoutineSchema = z.union([
  z.object({ template: z.enum(["shoulder", "elbow", "trunk"]) }),
  z.object({ name: z.string().trim().min(1).max(60), exercises: z.array(prehabExerciseSchema).min(1).max(20) }),
]);

/** Plantillas genéricas: ajústalas con tu fisio o tu entrenadora. */
export const PREHAB_TEMPLATES = {
  shoulder: {
    name: "Hombro del lanzador",
    exercises: [
      { name: "Rotación externa con goma (codo pegado)", dose: "2 × 15" },
      { name: "Rotación externa a 90° con goma", dose: "2 × 12" },
      { name: "Y-T-W en banco inclinado", dose: "2 × 8 cada letra" },
      { name: "Flexión con protracción (serrato)", dose: "2 × 12" },
      { name: "Estiramiento sleeper (suave)", dose: "2 × 30 s" },
    ],
  },
  elbow: {
    name: "Codo y antebrazo",
    exercises: [
      { name: "Flexores de muñeca excéntricos", dose: "2 × 15" },
      { name: "Extensores de muñeca excéntricos", dose: "2 × 15" },
      { name: "Pronación y supinación con martillo", dose: "2 × 12" },
      { name: "Agarre isométrico", dose: "3 × 30 s" },
    ],
  },
  trunk: {
    name: "Tronco y cadera",
    exercises: [
      { name: "Plancha lateral", dose: "2 × 30 s por lado" },
      { name: "Copenhague (aductores)", dose: "2 × 8 por lado" },
      { name: "Dead bug", dose: "2 × 10" },
      { name: "Puente de glúteo a una pierna", dose: "2 × 10 por lado" },
    ],
  },
} as const;

/** Días hechos en la semana actual (lunes a hoy) y en los últimos 7 días. */
export function adherence(dates: string[], today: string) {
  const t = Date.parse(`${today}T00:00:00Z`);
  const monday = t - (((new Date(t).getUTCDay() + 6) % 7) * 864e5);
  const set = new Set(dates);
  const last7 = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(t - (6 - i) * 864e5).toISOString().slice(0, 10);
    return { date: d, done: set.has(d) };
  });
  return { thisWeek: dates.filter((d) => Date.parse(`${d}T00:00:00Z`) >= monday && d <= today).length, last7, doneToday: set.has(today) };
}
