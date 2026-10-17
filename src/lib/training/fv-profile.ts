import { z } from "zod";

import { G, jumpHeight, takeoffVelocity } from "./jump";

/**
 * Perfil fuerza-velocidad en salto (método simple de Samozino et al., 2008, J Biomech 41:2940; óptimo según
 * Samozino et al., 2012, Med Sci Sports Exerc 44:313). Con SJ a 2–4 cargas, la altura de cada salto, la masa y la
 * distancia de impulso (hPO) dan la fuerza y la velocidad medias del impulso; la recta F-v da F0, V0 y Pmax.
 * Todo relativo a la masa corporal (N/kg, m/s, W/kg). Fórmulas puras para cliente y servidor.
 */

/**
 * Bandas del desequilibrio FVimb (%): < 10 equilibrado, 10–40 bajo, > 40 alto
 * (Jiménez-Reyes et al., 2017, Front Physiol 7:677). Referencia publicada, no umbral personal.
 */
export const FV_IMBALANCE_BANDS = { balanced: 10, low: 40 } as const;
/**
 * Por debajo de este r² se avisa (se guarda igual): los perfiles por saltos con carga suelen ser muy lineales,
 * r² > 0,95 (Samozino et al., 2014, Int J Sports Med 35:505; Jiménez-Reyes et al., 2017).
 */
export const FV_MIN_R2 = 0.95;
export const FV_MIN_LOADS = 2;
export const FV_MAX_LOADS = 4;

export type FvLoad = { addedKg: number; heightCm: number };
export type FvInput = { bodyMassKg: number; hpoCm: number; loads: FvLoad[] };

/** Fuerza, velocidad y potencia medias del impulso de un salto (Samozino et al., 2008). Fuerza y potencia por kg corporal. */
export function pushOff(bodyMassKg: number, hpoM: number, load: FvLoad) {
  const h = load.heightCm / 100;
  const flightS = Math.sqrt((8 * h) / G); // inversa de jumpHeight
  const velocity = takeoffVelocity(flightS) / 2; // v̄ = √(g·h/2): la media del impulso es la mitad de la de despegue
  const force = ((bodyMassKg + load.addedKg) * G * (h / hpoM + 1)) / bodyMassKg;
  return { ...load, flightS, heightM: jumpHeight(flightS), force, velocity, power: force * velocity };
}

/**
 * Altura (m) que da un perfil (F0, V0) con hPO y una masa total `massRatio` veces la corporal: se resuelve
 * k·(2v̄²/hPO + g) = F0 − (F0/V0)·v̄ (ecuación de 2.º grado en v̄) y h = 2v̄²/g.
 */
export function predictedHeightM(F0: number, V0: number, hpoM: number, massRatio = 1) {
  const a = F0 / V0;
  const k = massRatio;
  const disc = a * a - (8 * k * (k * G - F0)) / hpoM;
  if (!(F0 > k * G) || disc < 0) return 0;
  const v = (-a + Math.sqrt(disc)) / ((4 * k) / hpoM);
  return (2 * v * v) / G;
}

/** Pendiente óptima (N·s/m/kg, negativa) para Pmax y hPO dados: la que da la mayor altura (Samozino et al., 2012). */
export function optimalSlope(pmax: number, hpoM: number) {
  // Con Pmax fija, F0 = 2√(P·a) y V0 = 2√(P/a), a = −S. Búsqueda dorada en log(a) (la altura es unimodal en a).
  const h = (logA: number) => {
    const a = Math.exp(logA);
    return predictedHeightM(2 * Math.sqrt(pmax * a), 2 * Math.sqrt(pmax / a), hpoM);
  };
  const phi = (Math.sqrt(5) - 1) / 2;
  let lo = Math.log(0.1);
  let hi = Math.log(1000);
  let x1 = hi - phi * (hi - lo);
  let x2 = lo + phi * (hi - lo);
  let h1 = h(x1);
  let h2 = h(x2);
  for (let i = 0; i < 200 && hi - lo > 1e-10; i++) {
    if (h1 < h2) {
      lo = x1; x1 = x2; h1 = h2; x2 = lo + phi * (hi - lo); h2 = h(x2);
    } else {
      hi = x2; x2 = x1; h2 = h1; x1 = hi - phi * (hi - lo); h1 = h(x1);
    }
  }
  return -Math.exp((lo + hi) / 2);
}

export type FvImbalance = "balanced" | "low" | "high";
export type FvProfile = {
  points: ReturnType<typeof pushOff>[];
  /** Fuerza máxima teórica (N/kg). */
  F0: number;
  /** Velocidad máxima teórica (m/s). */
  V0: number;
  /** Potencia máxima (W/kg) = F0·V0/4. */
  pmax: number;
  /** Pendiente de la recta F-v (N·s/m/kg, negativa). */
  slope: number;
  optimalSlope: number;
  /** S/Sopt en %: < 100 → déficit de fuerza; > 100 → déficit de velocidad. */
  ratioPct: number;
  /** FVimb = 100·|1 − S/Sopt| (%). */
  imbalancePct: number;
  imbalance: FvImbalance;
  deficit: "force" | "velocity" | null;
  r2: number;
};
export type FvResult = { ok: true; profile: FvProfile; warnings: string[] } | { ok: false; error: string };

/** Regresión lineal F = F0 + S·v y comparación con el perfil óptimo. */
export function computeFvProfile(input: FvInput): FvResult {
  const { bodyMassKg, hpoCm, loads } = input;
  if (loads.length < FV_MIN_LOADS) return { ok: false, error: `Hacen falta al menos ${FV_MIN_LOADS} saltos con cargas distintas (tienes ${loads.length}).` };
  if (loads.length > FV_MAX_LOADS) return { ok: false, error: `Como mucho ${FV_MAX_LOADS} cargas.` };
  if (!(bodyMassKg > 0) || !(hpoCm > 0) || loads.some((l) => !(l.heightCm > 0) || !(l.addedKg >= 0)))
    return { ok: false, error: "Peso, distancia de impulso y alturas deben ser mayores que cero." };
  if (new Set(loads.map((l) => l.addedKg)).size < FV_MIN_LOADS) return { ok: false, error: "Las cargas deben ser distintas: con la misma carga no hay recta fuerza-velocidad." };

  const hpoM = hpoCm / 100;
  const points = loads.map((l) => pushOff(bodyMassKg, hpoM, l));
  const n = points.length;
  const mv = points.reduce((s, p) => s + p.velocity, 0) / n;
  const mf = points.reduce((s, p) => s + p.force, 0) / n;
  const sxx = points.reduce((s, p) => s + (p.velocity - mv) ** 2, 0);
  const sxy = points.reduce((s, p) => s + (p.velocity - mv) * (p.force - mf), 0);
  const syy = points.reduce((s, p) => s + (p.force - mf) ** 2, 0);
  if (!(sxx > 1e-12)) return { ok: false, error: "Todas las cargas dan la misma velocidad: revisa las alturas." };
  const slope = sxy / sxx;
  if (!(slope < 0)) return { ok: false, error: "Con más carga no se puede saltar lo mismo o más: revisa las alturas o el orden de las cargas." };
  const F0 = mf - slope * mv;
  const V0 = -F0 / slope;
  if (!(F0 > G) || !(V0 > 0)) return { ok: false, error: "El perfil no tiene sentido físico (F0 menor que el peso): revisa los datos." };
  const r2 = syy > 0 ? (sxy * sxy) / (sxx * syy) : 1;
  const pmax = (F0 * V0) / 4;
  const opt = optimalSlope(pmax, hpoM);
  const ratio = slope / opt;
  const imbalancePct = 100 * Math.abs(1 - ratio);
  const imbalance: FvImbalance = imbalancePct < FV_IMBALANCE_BANDS.balanced ? "balanced" : imbalancePct <= FV_IMBALANCE_BANDS.low ? "low" : "high";

  const warnings: string[] = [];
  if (n === 2) warnings.push("Con 2 cargas la recta pasa por los dos puntos (r² = 1 siempre): con 3 o 4 cargas el perfil es más fiable.");
  else if (r2 < FV_MIN_R2) warnings.push(`La recta se ajusta mal (r² = ${r2.toFixed(2).replace(".", ",")} < ${String(FV_MIN_R2).replace(".", ",")}): repite algún salto o revisa las alturas.`);

  return {
    ok: true,
    warnings,
    profile: { points, F0, V0, pmax, slope, optimalSlope: opt, ratioPct: ratio * 100, imbalancePct, imbalance, deficit: imbalance === "balanced" ? null : ratio < 1 ? "force" : "velocity", r2 },
  };
}

export const FV_IMBALANCE_LABEL: Record<FvImbalance, string> = { balanced: "Equilibrado", low: "Desequilibrio bajo", high: "Desequilibrio alto" };
export const FV_DEFICIT_LABEL = { force: "déficit de fuerza (perfil orientado a velocidad)", velocity: "déficit de velocidad (perfil orientado a fuerza)" } as const;

export const fvLoadSchema = z.object({ addedKg: z.number().min(0).max(200), heightCm: z.number().gt(0).max(80) });
export const fvSeriesSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  bodyMassKg: z.number().min(30).max(200),
  hpoCm: z.number().min(15).max(60),
  loads: z.array(fvLoadSchema).min(FV_MIN_LOADS, `Hacen falta al menos ${FV_MIN_LOADS} saltos con cargas distintas`).max(FV_MAX_LOADS, `Como mucho ${FV_MAX_LOADS} cargas`),
});
export type FvSeriesInput = z.infer<typeof fvSeriesSchema>;
