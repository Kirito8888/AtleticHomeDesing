/**
 * v2.9 · Bloque B · Geometría de la somatocarta de Heath-Carter y series para las gráficas de
 * composición corporal. Puro (sin React ni BD): solo transforma resultados ya calculados por
 * `isak.ts`. Salud cifrada: como el resto de `health/isak*`, nunca va a la IA ni a la entrenadora.
 *
 * Coordenadas estándar (Carter y Heath, 1990): X = ectomorfia − endomorfia;
 * Y = 2 · mesomorfia − (endomorfia + ectomorfia).
 */
import type { IsakResult, Mass, Somatotype } from "./isak";

const r2 = (n: number) => Math.round(n * 100) / 100;

export type XY = { x: number; y: number };

/** Punto somatotípico en el plano cartesiano estándar. */
export function somatoXY(endo: number, meso: number, ecto: number): XY {
  return { x: r2(ecto - endo), y: r2(2 * meso - (endo + ecto)) };
}

/** Dominio fijo del dibujo: cubre el contorno clásico y deja margen para somatotipos extremos. */
export const DOMAIN = { xMin: -9, xMax: 9, yMin: -10, yMax: 16 } as const;
/** Lado del viewBox (cuadrado) y margen interior para las etiquetas. */
export const VIEW = 300;
const PAD = 22;
const SCALE = (VIEW - 2 * PAD) / Math.max(DOMAIN.xMax - DOMAIN.xMin, DOMAIN.yMax - DOMAIN.yMin);
const OFF_X = (VIEW - (DOMAIN.xMax - DOMAIN.xMin) * SCALE) / 2;
const OFF_Y = (VIEW - (DOMAIN.yMax - DOMAIN.yMin) * SCALE) / 2;

/** Cartesiano → viewBox (la Y del SVG crece hacia abajo). Recorta al dominio y lo indica. */
export function toSvg(p: XY): { cx: number; cy: number; clamped: boolean } {
  const x = Math.min(DOMAIN.xMax, Math.max(DOMAIN.xMin, p.x));
  const y = Math.min(DOMAIN.yMax, Math.max(DOMAIN.yMin, p.y));
  return {
    cx: r2(OFF_X + (x - DOMAIN.xMin) * SCALE),
    cy: r2(OFF_Y + (DOMAIN.yMax - y) * SCALE),
    clamped: x !== p.x || y !== p.y,
  };
}

/** Vértices canónicos: 7-1-1 (endo), 1-7-1 (meso), 1-1-7 (ecto). */
export const VERTICES = { endo: somatoXY(7, 1, 1), meso: somatoXY(1, 7, 1), ecto: somatoXY(1, 1, 7) } as const;

/**
 * Contorno de la somatocarta: tres lados curvados hacia fuera (Bézier cuadrática con el punto de
 * control desplazado desde el centro), aproximación del dibujo clásico, más los tres ejes que
 * parten del origen hacia cada vértice.
 */
export function somatochartOutline(): { outline: string; axes: Array<{ x1: number; y1: number; x2: number; y2: number }> } {
  const v = [VERTICES.endo, VERTICES.meso, VERTICES.ecto];
  const bulge = 0.35;
  const s = v.map(toSvg);
  const o = toSvg({ x: 0, y: 0 });
  let d = `M ${s[0].cx} ${s[0].cy}`;
  for (let i = 0; i < 3; i++) {
    const a = v[i];
    const b = v[(i + 1) % 3];
    const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    const c = toSvg({ x: mid.x + mid.x * bulge, y: mid.y + mid.y * bulge });
    const e = s[(i + 1) % 3];
    d += ` Q ${c.cx} ${c.cy} ${e.cx} ${e.cy}`;
  }
  return { outline: d + " Z", axes: s.map((p) => ({ x1: o.cx, y1: o.cy, x2: p.cx, y2: p.cy })) };
}

/** Lo mínimo que necesitan las gráficas: nunca las medidas brutas. */
export type CompositionPoint = { id: string; date: string; weightKg: number; somatotype: Somatotype; masses: IsakResult["masses"] };

export type TrajectoryPoint = { id: string; date: string; endo: number; meso: number; ecto: number; label: string; cx: number; cy: number; clamped: boolean } & XY;

/** Trayectoria en orden cronológico (la más reciente, la última). */
export function trajectory(points: CompositionPoint[]): TrajectoryPoint[] {
  return [...points]
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((p) => {
      const { endo, meso, ecto, label } = p.somatotype;
      const xy = somatoXY(endo, meso, ecto);
      return { id: p.id, date: p.date, endo, meso, ecto, label, ...xy, ...toSvg(xy) };
    });
}

export const MASS_KEYS = ["fat", "muscle", "bone", "residual"] as const;
export type MassKey = (typeof MASS_KEYS)[number];
export type MassDelta = { kg: number; pct: number } | null;

/** Variación de cada masa frente a la medición previa (kg y puntos porcentuales). */
export function massDeltas(curr: IsakResult["masses"], prev?: IsakResult["masses"] | null): Record<MassKey, MassDelta> {
  const d = (k: MassKey): MassDelta => (prev ? { kg: r2(curr[k].kg - prev[k].kg), pct: r2(curr[k].pct - prev[k].pct) } : null);
  return { fat: d("fat"), muscle: d("muscle"), bone: d("bone"), residual: d("residual") };
}

export type EvolutionRow = { date: string; weightKg: number; fatKg: number; fatPct: number; muscleKg: number; musclePct: number };

/** Serie temporal para las gráficas evolutivas (orden cronológico). */
export function evolutionSeries(points: CompositionPoint[]): EvolutionRow[] {
  const m = (x: Mass) => [r2(x.kg), r2(x.pct)] as const;
  return [...points]
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((p) => {
      const [fatKg, fatPct] = m(p.masses.fat);
      const [muscleKg, musclePct] = m(p.masses.muscle);
      return { date: p.date, weightKg: r2(p.weightKg), fatKg, fatPct, muscleKg, musclePct };
    });
}
