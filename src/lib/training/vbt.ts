/**
 * VBT (entrenamiento basado en la velocidad), puro.
 * Perfil carga-velocidad: regresión lineal kg → m/s con las series de cada
 * ejercicio; la RM estimada es la carga a la velocidad mínima (MVT). Necesita
 * al menos 3 cargas distintas y pendiente negativa; con R² < 0,8 es orientativa.
 */
export type LvProfile = { points: number; slope: number; intercept: number; r2: number; e1rm: number | null; reliable: boolean };

export function loadVelocityProfile(sets: Array<{ kg: number; v: number }>, mvt: number): LvProfile | null {
  const pts = sets.filter((s) => s.kg > 0 && s.v > 0);
  if (new Set(pts.map((p) => p.kg)).size < 3) return null;
  const n = pts.length;
  const mx = pts.reduce((a, p) => a + p.kg, 0) / n;
  const my = pts.reduce((a, p) => a + p.v, 0) / n;
  const sxy = pts.reduce((a, p) => a + (p.kg - mx) * (p.v - my), 0);
  const sxx = pts.reduce((a, p) => a + (p.kg - mx) ** 2, 0);
  const slope = sxy / sxx;
  if (!(slope < 0)) return null;
  const intercept = my - slope * mx;
  const ssTot = pts.reduce((a, p) => a + (p.v - my) ** 2, 0);
  const ssRes = pts.reduce((a, p) => a + (p.v - (intercept + slope * p.kg)) ** 2, 0);
  const r2 = ssTot ? 1 - ssRes / ssTot : 0;
  const e1rm = (mvt - intercept) / slope;
  const r = (x: number, d = 3) => Math.round(x * 10 ** d) / 10 ** d;
  return { points: n, slope: r(slope, 5), intercept: r(intercept), r2: r(r2), e1rm: e1rm > 0 ? Math.round(e1rm * 2) / 2 : null, reliable: r2 >= 0.8 };
}

/** Pérdida de velocidad en la sesión (%): de la serie más rápida a la última. */
export function velocityLoss(velocities: number[]): number | null {
  const v = velocities.filter((x) => x > 0);
  if (v.length < 2) return null;
  const best = Math.max(...v);
  return Math.round(((best - v.at(-1)!) / best) * 1000) / 10;
}
