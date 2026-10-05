// =============================================================================
// Fuerza: 1RM estimado, tonelaje y estrés por series.
// =============================================================================

import { clamp } from "@/lib/dates";

export interface StrengthSetInput {
  reps: number;
  weightKg: number;
  rpe?: number | null;
  rir?: number | null;
  isWarmup?: boolean | null;
  /** Fracción del peso corporal que mueve el ejercicio (dominadas ≈ 1, fondos ≈ 0.9). */
  bodyweightFactor?: number | null;
}

/** RPE asumido cuando la serie no trae ni RPE ni RIR. */
export const DEFAULT_SET_RPE = 7.5;
/** TSS que aporta una "serie dura" de referencia (RPE 8). ~20 series duras ≈ 100 TSS. */
export const TSS_PER_HARD_SET = 5;

/** Repeticiones en reserva a partir de RIR o, si no hay, de RPE (RIR ≈ 10 − RPE). */
export function repsInReserve(set: Pick<StrengthSetInput, "rpe" | "rir">): number {
  if (set.rir != null) return Math.max(0, set.rir);
  if (set.rpe != null) return Math.max(0, 10 - set.rpe);
  return 0;
}

/**
 * 1RM estimado. Usa repeticiones hasta el fallo = reps + RIR.
 *   ≤ 10 reps al fallo → Brzycki (más preciso en rangos bajos)
 *   11–15              → Epley
 *   > 15               → null (estimación poco fiable)
 */
export function estimateOneRm(weightKg: number, reps: number, rir = 0): number | null {
  if (weightKg <= 0 || reps <= 0) return null;
  const toFailure = reps + Math.max(0, rir);
  if (toFailure === 1) return weightKg;
  if (toFailure <= 10) return (weightKg * 36) / (37 - toFailure);
  if (toFailure <= 15) return weightKg * (1 + toFailure / 30);
  return null;
}

/** Peso efectivo movido en la serie (incluye peso corporal cuando aplica). */
export function effectiveLoadKg(set: StrengthSetInput, bodyWeightKg?: number | null): number {
  return set.weightKg + (set.bodyweightFactor ?? 0) * (bodyWeightKg ?? 0);
}

/** Tonelaje = Σ reps × carga efectiva de las series que no son calentamiento. */
export function tonnageKg(sets: StrengthSetInput[], bodyWeightKg?: number | null): number {
  return sets
    .filter((s) => !s.isWarmup)
    .reduce((acc, s) => acc + s.reps * effectiveLoadKg(s, bodyWeightKg), 0);
}

/**
 * Estrés por series ("hard-set equivalents"): cada serie efectiva pesa
 * (esfuerzo / 0.8)², con esfuerzo = RPE/10 o (10 − RIR)/10. Una serie a RPE 8
 * cuenta 1; a RPE 10, 1.56; a RPE 6, 0.56. Los calentamientos no suman.
 * Se basa en el recuento de series cercanas al fallo como indicador de
 * estímulo/fatiga, más estable que el tonelaje bruto entre ejercicios.
 */
export function strengthSessionStress(sets: StrengthSetInput[]): { hardSets: number; tss: number } {
  let hardSets = 0;
  for (const s of sets) {
    if (s.isWarmup || s.reps <= 0) continue;
    const rpe = s.rpe ?? (s.rir != null ? 10 - s.rir : DEFAULT_SET_RPE);
    const effort = clamp(rpe, 1, 10) / 10;
    hardSets += (effort / 0.8) ** 2;
  }
  return { hardSets, tss: hardSets * TSS_PER_HARD_SET };
}
