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
