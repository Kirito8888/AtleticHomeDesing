// =============================================================================
// N9 · Una frase que explica la readiness y el PMC. Lógica pura por reglas y rangos:
// sin IA, sin BD. Los tipos de entrada limitan qué puede citar cada frase:
//   - explainPmc solo recibe carga (CTL/ATL/TSB/ACWR/rampa): nunca habla de recuperación,
//     así que vale también para la entrenadora sin ámbito RECOVERY.
//   - explainReadiness solo recibe los componentes de la readiness: ni ciclo ni ISAK.
// =============================================================================

import { formatNum, READINESS_LABEL } from "@/lib/format";
import { READINESS_WEIGHTS, type ReadinessComponent } from "@/lib/training/readiness";

/** Nombre de cada componente de la readiness (UI y frases). */
export const PART_LABEL: Record<ReadinessComponent, string> = {
  hrv: "VFC vs tu línea base",
  tsb: "Forma (TSB)",
  sleep: "Sueño",
  rhr: "FC reposo vs línea base",
  doms: "Agujetas",
  wellness: "Bienestar",
};

/** Cómo se nombra el componente dentro de la frase. */
const PART_PHRASE: Record<ReadinessComponent, string> = {
  hrv: "la VFC frente a tu línea base",
  tsb: "la forma (TSB)",
  sleep: "el sueño",
  rhr: "la FC en reposo frente a tu línea base",
  doms: "las agujetas",
  wellness: "el bienestar",
};

export interface PmcNow {
  ctl: number;
  atl: number;
  tsb: number;
  acwr?: number | null;
  rampRate?: number | null;
}

/** Cortes de TSB alineados con `tsbStatus` (components/status.tsx): −25 y −10. */
function tsbBase(tsb: number): string {
  const v = formatNum(tsb);
  if (tsb < -25) return `Fatiga alta acumulada: la fatiga supera al fitness en ${formatNum(-tsb)}`;
  if (tsb < -10) return `Bloque de carga: forma ${v}, la fatiga va por delante del fitness`;
  if (tsb <= 5) return `Equilibrio: forma ${v}, fatiga y fitness casi a la par`;
  if (tsb <= 25) return `Fresca: forma ${v}, buen momento para competir o apretar`;
  return `Descanso largo: forma ${v}, el fitness empieza a bajar`;
}

/** Un matiz como máximo, por prioridad: pico de carga, subida agresiva, base baja. */
function pmcNuance(n: PmcNow): string | null {
  if (n.acwr != null && n.acwr > 1.5) return `pico de carga (ACWR ${formatNum(n.acwr, 2)})`;
  if (n.rampRate != null && n.rampRate > 8) return `el fitness sube rápido (+${formatNum(n.rampRate)}/sem)`;
  if (n.ctl < 10) return "base de fitness aún baja";
  return null;
}

/** Frase de una línea del PMC. Solo usa carga deportiva. */
export function explainPmc(n: PmcNow): string {
  const nuance = pmcNuance(n);
  return `${tsbBase(n.tsb)}${nuance ? `; ${nuance}` : ""}.`;
}

export interface ReadinessNow {
  score: number | null | undefined;
  label?: keyof typeof READINESS_LABEL | null;
  parts: Partial<Record<ReadinessComponent, number | null>>;
  usedWeight?: number | null;
}

/** Referencia «neutra» de cada parte (z = 0 en VFC/FC → 75). */
const NEUTRAL = 75;

/** Frase de una línea de la readiness: el factor que más resta (o más suma). */
export function explainReadiness(r: ReadinessNow): string | null {
  if (r.score == null) return null;
  const label = r.label ?? (r.score >= 75 ? "READY" : r.score >= 50 ? "MODERATE" : "RECOVER");
  const entries = (Object.keys(READINESS_WEIGHTS) as ReadinessComponent[])
    .map((k) => ({ k, v: r.parts[k] }))
    .filter((e): e is { k: ReadinessComponent; v: number } => typeof e.v === "number" && Number.isFinite(e.v))
    .map((e) => ({ ...e, impact: (e.v - NEUTRAL) * READINESS_WEIGHTS[e.k] }));
  const few = r.usedWeight != null && r.usedWeight < 0.6 ? " (con pocos datos)" : "";
  const head = READINESS_LABEL[label];
  if (!entries.length) return `${head}${few}.`;
  const worst = entries.reduce((a, b) => (b.impact < a.impact ? b : a));
  if (worst.impact < 0) return `${head}: lo que más resta hoy es ${PART_PHRASE[worst.k]} (${Math.round(worst.v)}/100)${few}.`;
  const best = entries.reduce((a, b) => (b.impact > a.impact ? b : a));
  return `${head}: lo que más suma hoy es ${PART_PHRASE[best.k]} (${Math.round(best.v)}/100)${few}.`;
}
