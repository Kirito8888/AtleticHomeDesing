// =============================================================================
// Training Stress Score (TSS) por tipo de sesión.
// Convención TrainingPeaks: 1 hora exactamente en umbral = 100 TSS.
// Todas las funciones son puras; devuelven null si faltan datos.
// =============================================================================

import { clamp } from "@/lib/dates";
import { strengthSessionStress, type StrengthSetInput } from "@/lib/training/strength";

export type SexInput = "MALE" | "FEMALE" | "OTHER" | null | undefined;

export interface Thresholds {
  hrMax?: number | null;
  hrRest?: number | null;
  lthr?: number | null;
  thresholdPaceSecPerKm?: number | null;
  thresholdPaceSecPer100mSwim?: number | null;
}

/** RPE (CR-10) que se considera "umbral": 60 min a RPE 7 ≈ 100 TSS. */
export const SRPE_THRESHOLD_RPE = 7;
/** TSS por intento técnico a intensidad de referencia (lanzamiento/salto a RPE 7). */
export const TSS_PER_TECHNICAL_ATTEMPT = 1.5;

// ---------------------------------------------------------------------------
// Cardio basado en FC (hrTSS)
// ---------------------------------------------------------------------------

/**
 * TRIMP de Banister. HRr = (FCmedia − FCreposo) / (FCmáx − FCreposo).
 * Factor de ponderación exponencial distinto por sexo (Banister 1991).
 */
export function banisterTrimp(durationMin: number, hrAvg: number, hrRest: number, hrMax: number, sex: SexInput): number {
  const hrr = clamp((hrAvg - hrRest) / (hrMax - hrRest), 0, 1);
  const [a, b] = sex === "FEMALE" ? [0.86, 1.67] : [0.64, 1.92];
  return durationMin * hrr * a * Math.exp(b * hrr);
}

/**
 * hrTSS = TRIMP(sesión) / TRIMP(60 min a LTHR) × 100.
 * Así una hora a FC de umbral láctico vale exactamente 100.
 */
export function hrTss(params: {
  durationSec: number;
  hrAvg: number;
  thresholds: Thresholds;
  sex?: SexInput;
}): number | null {
  const { durationSec, hrAvg, thresholds, sex } = params;
  const { hrRest, hrMax, lthr } = thresholds;
  if (!durationSec || !hrAvg || !hrRest || !hrMax || !lthr) return null;
  if (hrMax <= hrRest || lthr <= hrRest || lthr > hrMax) return null;
  const session = banisterTrimp(durationSec / 60, hrAvg, hrRest, hrMax, sex);
  const hourAtThreshold = banisterTrimp(60, lthr, hrRest, hrMax, sex);
  return (session / hourAtThreshold) * 100;
}

// ---------------------------------------------------------------------------
// Cardio basado en ritmo (rTSS carrera, sTSS natación)
// ---------------------------------------------------------------------------

/** rTSS = h × IF² × 100, IF = ritmo umbral / ritmo medio (s/km: menor = más rápido). */
export function runPaceTss(durationSec: number, paceSecPerKm: number, thresholdPaceSecPerKm: number): number | null {
  if (!durationSec || !paceSecPerKm || !thresholdPaceSecPerKm) return null;
  const intensity = thresholdPaceSecPerKm / paceSecPerKm;
  return (durationSec / 3600) * intensity ** 2 * 100;
}

/** Natación: el coste crece con el cubo de la velocidad (resistencia del agua) → IF³. */
export function swimPaceTss(durationSec: number, paceSecPer100m: number, cssSecPer100m: number): number | null {
  if (!durationSec || !paceSecPer100m || !cssSecPer100m) return null;
  const intensity = cssSecPer100m / paceSecPer100m;
  return (durationSec / 3600) * intensity ** 3 * 100;
}

// ---------------------------------------------------------------------------
// Session-RPE (Foster) normalizado a escala TSS
// ---------------------------------------------------------------------------

/**
 * Foster: carga = RPE × minutos (UA), lineal en ambos factores (así está
 * validado). Se reescala a TSS dividiendo por la carga de 60 min a RPE 7:
 *   TSS = (RPE × min) / (7 × 60) × 100   → 60 min a RPE 7 = 100.
 */
export function srpeTss(durationSec: number, sessionRpe: number): number | null {
  if (!durationSec || !sessionRpe) return null;
  return (fosterLoad(durationSec, clamp(sessionRpe, 0, 10)) / (SRPE_THRESHOLD_RPE * 60)) * 100;
}

/** Carga de Foster en unidades arbitrarias (RPE × min), útil para mostrar. */
export function fosterLoad(durationSec: number, sessionRpe: number): number {
  return (durationSec / 60) * sessionRpe;
}

// ---------------------------------------------------------------------------
// Técnica (lanzamientos y saltos) sin duración/RPE
// ---------------------------------------------------------------------------

/**
 * Cada intento es un esfuerzo máximo de alta carga neuromuscular y articular.
 * TSS ≈ intentos × 1.5 × (RPE/7)². Si no hay RPE se asume intensidad de referencia.
 */
export function technicalAttemptsTss(attempts: number, sessionRpe?: number | null): number | null {
  if (!attempts) return null;
  const intensity = sessionRpe ? clamp(sessionRpe, 0, 10) / SRPE_THRESHOLD_RPE : 1;
  return attempts * TSS_PER_TECHNICAL_ATTEMPT * intensity ** 2;
}

// ---------------------------------------------------------------------------
// Selección automática del método
// ---------------------------------------------------------------------------

export type TssMethodName = "HR_TSS" | "PACE_TSS" | "SRPE" | "TONNAGE" | "TECHNICAL" | "MANUAL";

export interface TssInput {
  type: "TRACK" | "TECHNICAL" | "STRENGTH" | "MIXED";
  durationSec?: number | null;
  sessionRpe?: number | null;
  manualTss?: number | null;
  sex?: SexInput;
  thresholds?: Thresholds | null;
  track?: {
    modality: string;
    movingTimeSec?: number | null;
    hrAvg?: number | null;
    avgPaceSecPerKm?: number | null;
    avgPaceSecPer100m?: number | null;
  } | null;
  technical?: { attempts: number } | null;
  strength?: { sets: StrengthSetInput[]; bodyWeightKg?: number | null } | null;
}

export interface TssResult {
  tss: number | null;
  method: TssMethodName | null;
  /** Todos los métodos calculables, para mostrar/auditar alternativas. */
  candidates: Partial<Record<TssMethodName, number>>;
}

/**
 * Prioridad (de más a menos objetivo):
 *   MANUAL > HR_TSS > PACE_TSS > SRPE > TONNAGE / TECHNICAL
 * Para fuerza y técnica se prefiere sRPE porque está validado para esas
 * modalidades (Day et al. 2004; Sweet et al. 2004); los modelos por series o
 * intentos son el respaldo cuando no hay duración o RPE de sesión.
 */
export function computeSessionTss(input: TssInput): TssResult {
  const candidates: Partial<Record<TssMethodName, number>> = {};
  const thresholds = input.thresholds ?? {};
  const t = input.track;

  if (t) {
    const dur = t.movingTimeSec ?? input.durationSec ?? 0;
    if (t.hrAvg) {
      const v = hrTss({ durationSec: dur, hrAvg: t.hrAvg, thresholds, sex: input.sex });
      if (v != null) candidates.HR_TSS = v;
    }
    if (t.modality === "SWIM" && t.avgPaceSecPer100m && thresholds.thresholdPaceSecPer100mSwim) {
      const v = swimPaceTss(dur, t.avgPaceSecPer100m, thresholds.thresholdPaceSecPer100mSwim);
      if (v != null) candidates.PACE_TSS = v;
    } else if (
      ["RUN", "SPRINT", "HURDLES", "WALK"].includes(t.modality) &&
      t.avgPaceSecPerKm &&
      thresholds.thresholdPaceSecPerKm
    ) {
      const v = runPaceTss(dur, t.avgPaceSecPerKm, thresholds.thresholdPaceSecPerKm);
      if (v != null) candidates.PACE_TSS = v;
    }
  }

  if (input.durationSec && input.sessionRpe) {
    const v = srpeTss(input.durationSec, input.sessionRpe);
    if (v != null) candidates.SRPE = v;
  }

  if (input.strength?.sets.length) {
    const v = strengthSessionStress(input.strength.sets).tss;
    if (v > 0) candidates.TONNAGE = v;
  }

  if (input.technical?.attempts) {
    const v = technicalAttemptsTss(input.technical.attempts, input.sessionRpe);
    if (v != null) candidates.TECHNICAL = v;
  }

  if (input.manualTss != null) {
    return { tss: input.manualTss, method: "MANUAL", candidates };
  }

  const order: TssMethodName[] = ["HR_TSS", "PACE_TSS", "SRPE", "TONNAGE", "TECHNICAL"];
  for (const m of order) {
    const v = candidates[m];
    if (v != null) return { tss: Math.round(v * 10) / 10, method: m, candidates };
  }
  return { tss: null, method: null, candidates };
}
