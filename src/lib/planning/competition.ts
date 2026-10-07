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

/** Calentamiento por bloques contando hacia atrás desde la hora de la prueba (minutos desde las 00:00). */
export type WarmupState = { startMin: number; blocks: Array<{ name: string; from: number; to: number }>; current: number | null; remainingSec: number | null; phase: "before" | "during" | "done" };

export function warmupSchedule(blocks: Array<{ name: string; minutes: number }>, eventMin: number, nowSec: number): WarmupState {
  const total = blocks.reduce((a, b) => a + b.minutes, 0);
  const startMin = eventMin - total;
  let t = startMin;
  const list = blocks.map((b) => {
    const from = t;
    t += b.minutes;
    return { name: b.name, from, to: t };
  });
  if (nowSec < startMin * 60) return { startMin, blocks: list, current: null, remainingSec: startMin * 60 - nowSec, phase: "before" };
  const i = list.findIndex((b) => nowSec < b.to * 60);
  if (i === -1) return { startMin, blocks: list, current: null, remainingSec: null, phase: "done" };
  return { startMin, blocks: list, current: i, remainingSec: list[i].to * 60 - nowSec, phase: "during" };
}

export const hhmm = (min: number) => `${String(Math.floor((((min % 1440) + 1440) % 1440) / 60)).padStart(2, "0")}:${String((((min % 60) + 60) % 60)).padStart(2, "0")}`;
