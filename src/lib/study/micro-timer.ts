/**
 * Temporizador de micro-intervalos (v2.5 · Estudio B13). Funciones puras con `now` inyectado: el
 * componente solo guarda el estado y llama a `tick` cada segundo. Cuenta contra la hora de fin, así no
 * se desfasa si el móvil duerme la pestaña.
 */
export interface Preset {
  focus: number;
  rest: number;
}
export const PRESETS: readonly Preset[] = [
  { focus: 10, rest: 2 },
  { focus: 15, rest: 3 },
  { focus: 20, rest: 5 },
];

/** Acota el preset: foco 5–30 min y descanso 1–10 (valores no numéricos → 15 y 3). */
export const clampPreset = (p: Preset): Preset => ({
  focus: Math.min(30, Math.max(5, Math.round(p.focus) || 15)),
  rest: Math.min(10, Math.max(1, Math.round(p.rest) || 3)),
});

export type Phase = "focus" | "rest" | "idle";
export interface MicroRun {
  phase: Phase;
  stepIndex: number;
  /** Fin del tramo en curso (ms epoch); null en pausa o en espera. */
  endAt: number | null;
  /** Milisegundos que quedaban al pausar; null si no está en pausa. */
  pausedLeftMs: number | null;
  preset: Preset;
  done: number[];
}

const MIN = 60_000;
const total = (r: MicroRun) => (r.phase === "rest" ? r.preset.rest : r.preset.focus) * MIN;

/**
 * Arranca el foco de un paso.
 *
 * @param now Hora actual en ms epoch (inyectada para poder probarlo).
 * @param done Pasos ya hechos (índices).
 */
export function startStep(stepIndex: number, preset: Preset, now: number, done: number[] = []): MicroRun {
  const p = clampPreset(preset);
  return { phase: "focus", stepIndex, endAt: now + p.focus * MIN, pausedLeftMs: null, preset: p, done };
}

/** Milisegundos que quedan del tramo: 0 en espera, lo guardado en pausa, o `endAt − now` sin bajar de 0. */
export function remainingMs(r: MicroRun, now: number): number {
  if (r.phase === "idle") return 0;
  if (r.pausedLeftMs != null) return r.pausedLeftMs;
  return Math.max(0, (r.endAt ?? now) - now);
}

/** 0–1 del tramo en curso. */
export function intervalProgress(r: MicroRun, now: number): number {
  if (r.phase === "idle") return 1;
  return Math.min(1, Math.max(0, 1 - remainingMs(r, now) / total(r)));
}

/** Está en pausa si guarda el tiempo restante. */
export const isPaused = (r: MicroRun) => r.pausedLeftMs != null;

/** Congela el tramo guardando lo que queda. Sin efecto (mismo objeto) en espera o si ya está en pausa. */
export function pause(r: MicroRun, now: number): MicroRun {
  if (r.phase === "idle" || isPaused(r)) return r;
  return { ...r, endAt: null, pausedLeftMs: remainingMs(r, now) };
}

/** Reanuda desde lo guardado. Sin efecto (mismo objeto) si no estaba en pausa. */
export function resume(r: MicroRun, now: number): MicroRun {
  if (r.pausedLeftMs == null) return r;
  return { ...r, endAt: now + r.pausedLeftMs, pausedLeftMs: null };
}

/** Foco vencido → descanso; descanso vencido → espera («Siguiente paso»). Si no venció, devuelve el mismo objeto. */
export function tick(r: MicroRun, now: number): MicroRun {
  if (r.phase === "idle" || isPaused(r) || remainingMs(r, now) > 0) return r;
  if (r.phase === "focus") return { ...r, phase: "rest", endAt: now + r.preset.rest * MIN };
  return { ...r, phase: "idle", endAt: null };
}

/** Marca el paso como hecho y pasa al siguiente pendiente (en espera, sin arrancar). */
export function completeStep(r: MicroRun, total: number): MicroRun {
  const done = r.done.includes(r.stepIndex) ? r.done : [...r.done, r.stepIndex];
  const order = Array.from({ length: total }, (_, i) => (r.stepIndex + 1 + i) % total);
  const next = order.find((i) => !done.includes(i));
  return { ...r, phase: "idle", endAt: null, pausedLeftMs: null, done, stepIndex: next ?? r.stepIndex };
}

/** Salta el descanso o arranca el paso en curso tras una espera. */
export function beginFocus(r: MicroRun, now: number): MicroRun {
  return startStep(r.stepIndex, r.preset, now, r.done);
}

/** Fracción 0–1 de pasos hechos (0 si no hay pasos). */
export const stepsProgress = (r: MicroRun, totalSteps: number) => (totalSteps ? r.done.length / totalSteps : 0);
/** Todos los pasos hechos (falso si no hay pasos). */
export const isFinished = (r: MicroRun, totalSteps: number) => totalSteps > 0 && r.done.length >= totalSteps;
