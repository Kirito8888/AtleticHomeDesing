/** «D−3», «Día D», «D+1»: días hasta la competición (fechas ISO). */
export function countdownLabel(eventDay: string, today: string): string {
  const n = Math.round((Date.parse(`${eventDay}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 864e5);
  return n === 0 ? "Día D" : n > 0 ? `D−${n}` : `D+${-n}`;
}

export type SheetAttempt = { markM: number | null; isFoul: boolean; windMs: number | null };

/** Mejor intento válido de la hoja (null si todos nulos o sin medir). */
export function sheetBest(attempts: SheetAttempt[]): number | null {
  const valid = attempts.filter((a) => !a.isFoul && a.markM != null && a.markM > 0).map((a) => a.markM!);
  return valid.length ? Math.max(...valid) : null;
}
