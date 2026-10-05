// =============================================================================
// Readiness Score (0–100): cruza la forma (TSB) con marcadores de recuperación.
//
// Componentes y pesos (se renormalizan si falta alguno):
//   VFC (ln rMSSD vs línea base)  30 %  — Plews et al.: usar ln y la variación
//                                         individual, no valores absolutos.
//   TSB (forma)                   20 %
//   Sueño (horas + calidad)       20 %
//   FC en reposo vs línea base    10 %
//   DOMS                          10 %
//   Bienestar (fatiga/estrés/ánimo) 10 %
//
// Escalas de entrada:
//   sleepQuality, mood: 1 (malo) … 5 (excelente)
//   fatigue, stress:    1 (bajo, bien) … 5 (muy alto, mal)
//   doms:               0 (nada) … 10 (máximo)
// =============================================================================

import { clamp } from "@/lib/dates";

export const READINESS_WEIGHTS = {
  hrv: 0.3,
  tsb: 0.2,
  sleep: 0.2,
  rhr: 0.1,
  doms: 0.1,
  wellness: 0.1,
} as const;

export type ReadinessComponent = keyof typeof READINESS_WEIGHTS;

/** Mínimo de mediciones previas para considerar fiable una línea base. */
export const MIN_BASELINE_SAMPLES = 5;
export const SLEEP_TARGET_HOURS = 8;

export interface ReadinessInput {
  hrvRmssdMs?: number | null;
  restingHr?: number | null;
  sleepHours?: number | null;
  sleepQuality?: number | null;
  doms?: number | null;
  fatigue?: number | null;
  stress?: number | null;
  mood?: number | null;
  tsb?: number | null;
  /** Valores de los días previos (idealmente 7–60) para la línea base individual. */
  hrvHistory?: number[];
  restingHrHistory?: number[];
}

export interface ReadinessResult {
  score: number | null;
  label: "READY" | "MODERATE" | "RECOVER" | null;
  parts: Partial<Record<ReadinessComponent, number>>;
  /** Información auxiliar para explicar el resultado en la UI / al coach IA. */
  context: { hrvZ?: number; rhrZ?: number; usedWeight: number };
}

function meanSd(values: number[]): { mean: number; sd: number } | null {
  if (values.length < MIN_BASELINE_SAMPLES) return null;
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const variance = values.reduce((a, b) => a + (b - mean) ** 2, 0) / (values.length - 1);
  return { mean, sd: Math.sqrt(variance) };
}

/** z-score con un SD mínimo para que una línea base muy estable no dispare valores extremos. */
function zScore(value: number, history: number[], minSd: number): number | null {
  const stats = meanSd(history);
  if (!stats) return null;
  return (value - stats.mean) / Math.max(stats.sd, minSd);
}

export function hrvScore(hrv: number, history: number[]): { score: number; z: number } | null {
  if (hrv <= 0) return null;
  const z = zScore(
    Math.log(hrv),
    history.filter((h) => h > 0).map((h) => Math.log(h)),
    0.05,
  );
  if (z == null) return null;
  // z = 0 → 75; −1 SD → 45; −2 SD → 15; ≥ +0.83 SD → 100
  return { score: clamp(75 + 30 * z, 0, 100), z };
}

export function restingHrScore(rhr: number, history: number[]): { score: number; z: number } | null {
  const z = zScore(rhr, history, 1.5);
  if (z == null) return null;
  // FC en reposo elevada = peor
  return { score: clamp(75 - 30 * z, 0, 100), z };
}

export function sleepScore(hours?: number | null, quality?: number | null): number | null {
  if (hours == null && quality == null) return null;
  const parts: Array<[number, number]> = [];
  if (hours != null) {
    const deficit = Math.max(0, SLEEP_TARGET_HOURS - hours);
    const excess = Math.max(0, hours - 10);
    parts.push([clamp(100 - deficit * 20 - excess * 5, 0, 100), 0.7]);
  }
  if (quality != null) parts.push([((clamp(quality, 1, 5) - 1) / 4) * 100, 0.3]);
  const w = parts.reduce((a, [, wi]) => a + wi, 0);
  return parts.reduce((a, [s, wi]) => a + s * wi, 0) / w;
}

/** TSB 0 → 70; −10 → 50; −30 → 10; +15 → 100. */
export function tsbScore(tsb: number): number {
  return clamp(70 + 2 * tsb, 0, 100);
}

export function domsScore(doms: number): number {
  return clamp(100 - clamp(doms, 0, 10) * 10, 0, 100);
}

export function wellnessScore(fatigue?: number | null, stress?: number | null, mood?: number | null): number | null {
  const items: number[] = [];
  if (fatigue != null) items.push(((5 - clamp(fatigue, 1, 5)) / 4) * 100);
  if (stress != null) items.push(((5 - clamp(stress, 1, 5)) / 4) * 100);
  if (mood != null) items.push(((clamp(mood, 1, 5) - 1) / 4) * 100);
  if (!items.length) return null;
  return items.reduce((a, b) => a + b, 0) / items.length;
}

export function computeReadiness(input: ReadinessInput): ReadinessResult {
  const parts: Partial<Record<ReadinessComponent, number>> = {};
  const context: ReadinessResult["context"] = { usedWeight: 0 };

  if (input.hrvRmssdMs != null) {
    const r = hrvScore(input.hrvRmssdMs, input.hrvHistory ?? []);
    if (r) {
      parts.hrv = r.score;
      context.hrvZ = Math.round(r.z * 100) / 100;
    }
  }
  if (input.restingHr != null) {
    const r = restingHrScore(input.restingHr, input.restingHrHistory ?? []);
    if (r) {
      parts.rhr = r.score;
      context.rhrZ = Math.round(r.z * 100) / 100;
    }
  }
  const sleep = sleepScore(input.sleepHours, input.sleepQuality);
  if (sleep != null) parts.sleep = sleep;
  if (input.tsb != null) parts.tsb = tsbScore(input.tsb);
  if (input.doms != null) parts.doms = domsScore(input.doms);
  const wellness = wellnessScore(input.fatigue, input.stress, input.mood);
  if (wellness != null) parts.wellness = wellness;

  let weighted = 0;
  for (const [k, v] of Object.entries(parts) as Array<[ReadinessComponent, number]>) {
    weighted += v * READINESS_WEIGHTS[k];
    context.usedWeight += READINESS_WEIGHTS[k];
    parts[k] = Math.round(v);
  }
  context.usedWeight = Math.round(context.usedWeight * 100) / 100;

  // Sin al menos un 30 % del peso total el número no es representativo.
  if (context.usedWeight < 0.3) return { score: null, label: null, parts, context };

  const score = Math.round(weighted / context.usedWeight);
  const label = score >= 75 ? "READY" : score >= 50 ? "MODERATE" : "RECOVER";
  return { score, label, parts, context };
}
