/**
 * Propuesta automática de despegue y aterrizaje a partir de la señal de movimiento de la zona de los pies.
 * Lógica pura: el análisis del vídeo (en el navegador) vive en `components/training/jump-scan.ts`.
 * Es un borrador: nada se guarda sin que la atleta lo acepte y pueda ajustarlo fotograma a fotograma.
 *
 * Convención de marcas (guía de grabación): despegue = primer fotograma sin contacto; aterrizaje = primer fotograma
 * con contacto. Con la diferencia de fotogramas d[i] = |f_i − f_{i−1}|, ambos son el inicio de un pico de movimiento.
 */

/** Vuelo plausible en segundos reales (≈ 2 cm … 1,2 m de altura). Fuera de ahí no se propone. */
export const MIN_FLIGHT_S = 0.15;
export const MAX_FLIGHT_S = 1.0;
/** Por debajo no se propone nada. Constante del algoritmo (no personal); a calibrar con vídeos reales. */
export const MIN_CONFIDENCE = 0.5;
/** Un pico debe mover al menos este % de los píxeles de la zona (por encima del ruido de compresión). */
const MIN_PEAK = 0.01;
const MAX_NULL_FRACTION = 0.2;
const MERGE_GAP = 2;

export type MotionSignal = (number | null)[];
export type JumpCandidate = { takeoff: number; landing: number; confidence: number };
export type DetectResult = { status: "ok"; jumps: JumpCandidate[] } | { status: "low"; reason: string };

/** Fracción de píxeles (en gris) que cambian más de `pixelThreshold` entre dos fotogramas; null si no hay previo. */
export function motionFromFrames(prev: ArrayLike<number> | null, cur: ArrayLike<number>, pixelThreshold = 12): number | null {
  if (!prev || prev.length !== cur.length || cur.length === 0) return null;
  let n = 0;
  for (let i = 0; i < cur.length; i++) if (Math.abs(cur[i] - prev[i]) > pixelThreshold) n++;
  return n / cur.length;
}

const median = (a: number[]) => {
  const s = [...a].sort((x, y) => x - y);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};
const clamp01 = (x: number) => Math.max(0, Math.min(1, x));

type Segment = { start: number; end: number; onset: number; max: number };

function segmentsOf(sig: MotionSignal, thr: number): Segment[] {
  const out: Segment[] = [];
  let cur: Segment | null = null;
  let quiet = 0;
  sig.forEach((v, i) => {
    if (v != null && v > thr) {
      if (!cur) cur = { start: i, end: i, onset: i, max: v };
      else {
        cur.end = i;
        cur.max = Math.max(cur.max, v);
      }
      quiet = 0;
    } else if (cur && ++quiet > MERGE_GAP) {
      out.push(cur);
      cur = null;
    }
  });
  if (cur) out.push(cur);
  // Inicio real del pico: primer fotograma que llega a un cuarto del máximo (evita la rampa de entrada).
  for (const s of out) {
    for (let i = s.start; i <= s.end; i++) {
      const v = sig[i];
      if (v != null && v >= 0.25 * s.max) {
        s.onset = i;
        break;
      }
    }
  }
  return out;
}

/** `effFps`: fps efectivos del cálculo (los del fichero, o los de grabación con cámara lenta); fija el vuelo plausible. */
export function detectJumps(signal: MotionSignal, effFps: number): DetectResult {
  const low = (reason: string): DetectResult => ({ status: "low", reason });
  const valid = signal.filter((v): v is number => v != null);
  if (signal.length < 10 || valid.length === 0) return low("el vídeo es demasiado corto.");
  if (valid.length < signal.length * (1 - MAX_NULL_FRACTION)) return low("no se pudieron leer demasiados fotogramas.");

  const med = median(valid);
  const mad = median(valid.map((v) => Math.abs(v - med)));
  const thr = med + Math.max(6 * 1.4826 * mad, MIN_PEAK);
  const segs = segmentsOf(signal, thr);
  if (segs.length < 2) return low(segs.length ? "solo hay un movimiento claro en la parte baja del vídeo." : "no hay movimiento claro en la parte baja del vídeo.");

  const minF = MIN_FLIGHT_S * effFps;
  const maxF = MAX_FLIGHT_S * effFps;
  type Pair = { a: number; b: number; score: number };
  const pairs: Pair[] = [];
  for (let a = 0; a < segs.length; a++)
    for (let b = a + 1; b < segs.length; b++) {
      const gap = segs[b].onset - segs[a].onset;
      if (gap < minF || gap > maxF) continue;
      const peak = Math.min(segs[a].max, segs[b].max);
      const strength = clamp01((peak / thr - 1) / 3);
      const between = signal.slice(segs[a].end + 1, segs[b].start).filter((v): v is number => v != null);
      const mean = between.length ? between.reduce((s, v) => s + v, 0) / between.length : 0;
      const quiet = 1 - clamp01(mean / (0.5 * peak));
      pairs.push({ a, b, score: 0.6 * strength + 0.4 * quiet });
    }
  if (!pairs.length) return low("la distancia entre movimientos no corresponde a un vuelo plausible.");

  pairs.sort((p, q) => q.score - p.score);
  const used = new Set<number>();
  const jumps: JumpCandidate[] = [];
  let ambiguous = false;
  for (const p of pairs) {
    if (used.has(p.a) || used.has(p.b)) continue;
    // Unicidad: otro par parecido que comparta un pico con este resta confianza.
    const rival = pairs.find((q) => q !== p && (q.a === p.a || q.b === p.b || q.a === p.b || q.b === p.a));
    const unique = rival ? clamp01(1 - rival.score / Math.max(p.score, 1e-9)) : 1;
    const confidence = Math.round((p.score * (0.5 + 0.5 * unique)) * 100) / 100;
    if (confidence < MIN_CONFIDENCE) {
      ambiguous ||= !!rival && p.score >= MIN_CONFIDENCE;
      continue;
    }
    used.add(p.a);
    used.add(p.b);
    jumps.push({ takeoff: segs[p.a].onset, landing: segs[p.b].onset, confidence });
  }
  if (!jumps.length) return low(ambiguous ? "hay varios candidatos parecidos." : "los movimientos son demasiado débiles o poco claros.");
  return { status: "ok", jumps: jumps.sort((x, y) => x.takeoff - y.takeoff) };
}

export const confidenceLabel = (c: number) => (c >= 0.75 ? "alta" : "media");
