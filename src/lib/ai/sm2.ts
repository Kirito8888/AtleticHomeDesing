// =============================================================================
// Repetición espaciada SM-2 (SuperMemo 2, Wozniak 1990).
// grade: 0–5 (0–2 = fallo, 3 = difícil, 4 = bien, 5 = fácil)
// =============================================================================

export interface Sm2State {
  easeFactor: number;
  intervalDays: number;
  repetitions: number;
}

export function sm2(state: Sm2State, grade: number): Sm2State {
  const q = Math.max(0, Math.min(5, Math.round(grade)));
  if (q < 3) {
    // Fallo: se reinicia la serie, la tarjeta vuelve mañana; el EF no sube.
    return { easeFactor: Math.max(1.3, state.easeFactor - 0.2), intervalDays: 1, repetitions: 0 };
  }
  const repetitions = state.repetitions + 1;
  const intervalDays =
    repetitions === 1 ? 1 : repetitions === 2 ? 6 : Math.round(state.intervalDays * state.easeFactor);
  const easeFactor = Math.max(1.3, state.easeFactor + (0.1 - (5 - q) * (0.08 + (5 - q) * 0.02)));
  return { easeFactor: Math.round(easeFactor * 1000) / 1000, intervalDays, repetitions };
}

/** Estado de una tarjeta que la persona aún no ha repasado. */
export const SM2_INITIAL: Sm2State = { easeFactor: 2.5, intervalDays: 0, repetitions: 0 };

export interface Sm2Result {
  state: Sm2State;
  dueAt: Date;
  lastReviewedAt: Date;
  lastGrade: number;
}

/** Siguiente repaso de UNA persona: `prev` null = tarjeta nueva. Pura; no toca BD. */
export function nextReview(prev: Sm2State | null, grade: number, now: Date): Sm2Result {
  const state = sm2(prev ?? SM2_INITIAL, grade);
  const dueAt = new Date(now.getTime() + state.intervalDays * 86_400_000);
  return { state, dueAt, lastReviewedAt: now, lastGrade: Math.max(0, Math.min(5, Math.round(grade))) };
}
