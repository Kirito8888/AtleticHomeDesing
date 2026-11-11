// Precarga desde la sesión anterior (v2.10 B1 · N8). Parte pura, sin BD ni React.
import type { SetRow } from "@/components/training/strength-logger";

export interface PreviousSet {
  reps: number;
  weightKg: number;
  isWarmup: boolean;
  restSec: number | null;
}

/** Series de la última sesión COMPLETADA en la que apareció un ejercicio. */
export interface PreviousExercise {
  /** AAAA-MM-DD */
  date: string;
  sets: PreviousSet[];
}

export type PreviousByExercise = Record<string, PreviousExercise>;

/**
 * Filas de referencia para un ejercicio nuevo: `pending` = no se guardan hasta marcarlas «Hecha».
 * El descanso prescrito (restSec) viaja en `keep` para no perderlo si la serie se guarda.
 */
export function prefillSets(prev: PreviousExercise | undefined): SetRow[] | null {
  if (!prev || !prev.sets.length) return null;
  return prev.sets.map((s) => ({
    reps: s.reps,
    weightKg: s.weightKg,
    rpe: null,
    isWarmup: s.isWarmup,
    pending: true,
    prev: { kg: s.weightKg, reps: s.reps },
    keep: { rpe: null, rir: null, tempo: null, restSec: s.restSec, isFailure: false, notes: null },
  }));
}

/** «80×5 · 80×5 · 82,5×3» (sin calentamiento; máximo 6). */
export function summarizePrevious(prev: PreviousExercise, fmt: (n: number) => string = String): string {
  return prev.sets
    .filter((s) => !s.isWarmup)
    .slice(0, 6)
    .map((s) => `${fmt(s.weightKg)}×${s.reps}`)
    .join(" · ");
}
