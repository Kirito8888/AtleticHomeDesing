import { z } from "zod";

/**
 * Medidor de salto por vídeo: tiempo de vuelo contado en fotogramas (método validado en
 * Balsalobre-Fernández et al., 2015). El vídeo se procesa en el navegador; aquí solo hay
 * fórmulas puras que usan cliente y servidor (el servidor recalcula antes de guardar).
 */

export const G = 9.81;
/**
 * Fps admitidos para el cálculo (NTSC 30/60/120/240, PAL 25/50/100 y cine 24/48). Lo que se guarda son los fps
 * **efectivos** del tramo marcado: los del fichero si va a velocidad real, o los de grabación si va a cámara lenta.
 */
export const CAPTURE_FPS = [24, 25, 30, 48, 50, 60, 100, 120, 240] as const;
/** Cámara lenta del iPhone. */
export const SLOW_FPS = [120, 240] as const;
export type CaptureFps = (typeof CAPTURE_FPS)[number];
export const isCaptureFps = (f: number): f is CaptureFps => (CAPTURE_FPS as readonly number[]).includes(f);

/** Fps habituales de un fichero de vídeo, para redondear la medida del navegador. */
export const COMMON_FILE_FPS = [24, 25, 30, 48, 50, 60, 100, 120, 240] as const;
export const nearestFps = (raw: number) => COMMON_FILE_FPS.reduce<number>((a, b) => (Math.abs(b - raw) < Math.abs(a - raw) ? b : a), COMMON_FILE_FPS[0]);
/** Instante (s) del centro del fotograma `frame` en un fichero de `fileFps`: evita caer en el borde con el anterior. */
export const frameToTime = (frame: number, fileFps: number) => (frame + 0.5) / fileFps;
/** Fotograma que se muestra en el instante `t` (s) de un fichero de `fileFps`. */
export const timeToFrame = (t: number, fileFps: number) => Math.max(0, Math.floor(t * fileFps + 1e-6));

export const JUMP_TYPES = {
  cmj: { name: "CMJ (contramovimiento)", best: "cmj", mean: "cmjMean" },
  sj: { name: "SJ (sin contramovimiento)", best: "sj", mean: "sjMean" },
  abalakov: { name: "Abalakov (con brazos)", best: "abalakov", mean: "abalakovMean" },
  dj: { name: "Salto desde cajón (DJ)", best: "djRsi", mean: "djRsiMean" },
} as const;
export type JumpType = keyof typeof JUMP_TYPES;

/** Fotogramas marcados de un intento. `contact` (inicio del contacto tras caer del cajón) solo en DJ. */
export type JumpFrames = { takeoff: number; landing: number; contact?: number | null };

/** Tiempo de vuelo (s) entre el fotograma de despegue y el de aterrizaje. */
export const flightTime = (takeoff: number, landing: number, fps: number) => (landing - takeoff) / fps;
/** Altura (m) a partir del tiempo de vuelo: h = g·t²/8. */
export const jumpHeight = (t: number) => (G * t * t) / 8;
/** Velocidad de despegue (m/s): v = g·t/2. */
export const takeoffVelocity = (t: number) => (G * t) / 2;
/** Tiempo de contacto (s) en DJ: desde que toca el suelo hasta que despega. */
export const contactTime = (contact: number, takeoff: number, fps: number) => (takeoff - contact) / fps;
/** Índice de fuerza reactiva: altura (m) / contacto (s). */
export const rsi = (heightM: number, contactS: number) => heightM / contactS;

export type JumpAttempt = { frames: JumpFrames; flightS: number; heightCm: number; velocity: number; contactS: number | null; rsi: number | null };

export function computeAttempt(type: JumpType, fps: number, frames: JumpFrames): JumpAttempt {
  const t = flightTime(frames.takeoff, frames.landing, fps);
  const h = jumpHeight(t);
  const c = type === "dj" && frames.contact != null ? contactTime(frames.contact, frames.takeoff, fps) : null;
  return { frames, flightS: t, heightCm: h * 100, velocity: takeoffVelocity(t), contactS: c, rsi: c ? rsi(h, c) : null };
}

/** Valor que se guarda de un intento: altura en cm, o RSI en el DJ. */
export const attemptValue = (type: JumpType, a: JumpAttempt) => (type === "dj" ? (a.rsi ?? 0) : a.heightCm);

/** Mejor intento y media de los intentos (por altura, o por RSI en DJ). */
export function summarizeAttempts(type: JumpType, attempts: JumpAttempt[]) {
  if (!attempts.length) return null;
  const values = attempts.map((a) => attemptValue(type, a));
  const bestIdx = values.indexOf(Math.max(...values));
  return { best: attempts[bestIdx], bestValue: values[bestIdx], mean: values.reduce((s, v) => s + v, 0) / values.length };
}

/** Error (cm) que supone ±1 fotograma a `fps` para un vuelo de `flightS` segundos (0,5 s si no se conoce). */
export function frameErrorCm(fps: number, flightS?: number) {
  const t = flightS && flightS > 0 ? flightS : 0.5;
  return Math.abs(jumpHeight(t + 1 / fps) - jumpHeight(t)) * 100;
}

export type VideoSetup = {
  /** Fps del fichero que recibe el navegador (medidos o, si no se pudieron medir, indicados por la atleta). */
  fileFps: number;
  /** Si los fps del fichero se midieron en el navegador. */
  detected: boolean;
  /** Fps a los que se grabó. */
  recordedFps: number;
  /** El tramo marcado se ve a cámara lenta (vídeo de cámara lenta exportado). */
  slowMotion: boolean;
};

/**
 * Fps con los que se calcula: cuánto tiempo real dura cada fotograma **del fichero** en el tramo marcado.
 * A velocidad real, los del fichero (si iOS lo convirtió a 25, cada fotograma dura 40 ms aunque se grabara a 100).
 * En el tramo de cámara lenta, cada fotograma del fichero es un fotograma captado: los de grabación.
 */
export const effectiveFps = (v: VideoSetup) => (v.slowMotion ? v.recordedFps : v.fileFps);

const fmt = (n: number) => n.toFixed(1).replace(".", ",");

/** Avisos sobre la configuración del vídeo y el vuelo marcado (en fotogramas del fichero). */
export function videoWarnings(v: VideoSetup, flightFrames?: number | null): string[] {
  const out: string[] = [];
  const fileFlight = flightFrames && flightFrames > 0 ? flightFrames / v.fileFps : null;
  if (v.slowMotion) {
    if (v.recordedFps <= v.fileFps) out.push(`El fichero ya tiene ${v.fileFps} fps: no es una cámara lenta exportada. Marca «No» en cámara lenta.`);
    else if (fileFlight != null && fileFlight < 1)
      out.push(`Con cámara lenta, un salto dura varios segundos en el vídeo y aquí dura ${fmt(fileFlight)} s: parece que despegue y aterrizaje no están en el tramo lento. Marca «No» o amplía el tramo lento al editar el vídeo.`);
  } else {
    if (v.detected && v.recordedFps > v.fileFps)
      out.push(`Grabaste a ${v.recordedFps} fps pero el vídeo que ha llegado tiene ${v.fileFps}: el móvil lo ha convertido al elegirlo. Se calcula con ${v.fileFps} fps (±${fmt(frameErrorCm(v.fileFps, fileFlight ?? undefined))} cm). Para conservar los ${v.recordedFps} fps, súbelo desde Archivos (mira la guía).`);
    if (fileFlight != null && fileFlight > 1.2) out.push(`El vuelo dura ${fmt(fileFlight)} s en el vídeo, demasiado para un salto: si se ve a cámara lenta, marca «Sí» e indica los fps de grabación.`);
  }
  return out;
}

/** Con menos de 120 fps, error esperado de ±1 fotograma en la altura (cm) para el vuelo medido. */
export function fpsWarning(fps: number, flightS?: number): string | null {
  if (fps >= 120) return null;
  const err = fmt(frameErrorCm(fps, flightS));
  return `A ${fps} fps cada fotograma son ${Math.round(1000 / fps)} ms: error esperado de ±1 fotograma (≈ ±${err} cm). Graba a 120 o 240 fps.`;
}

/** Notas del resultado: fps y fotogramas de cada intento (máx. 200 caracteres). */
export function jumpNotes(type: JumpType, fps: number, attempts: JumpFrames[]): string {
  const frames = attempts.map((a) => (type === "dj" && a.contact != null ? `${a.contact}→${a.takeoff}→${a.landing}` : `${a.takeoff}→${a.landing}`)).join(", ");
  const s = `Vídeo ${fps} fps · ${attempts.length} intento${attempts.length === 1 ? "" : "s"} · fotogramas ${frames}`;
  return s.length > 200 ? `${s.slice(0, 199)}…` : s;
}

const frame = z.number().int().min(0).max(1_000_000);
export const jumpSessionSchema = z
  .object({
    type: z.enum(Object.keys(JUMP_TYPES) as [JumpType, ...JumpType[]]),
    fps: z.number().refine(isCaptureFps, "Fps de captura no admitidos").transform((f) => f as CaptureFps),
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    attempts: z.array(z.object({ takeoff: frame, landing: frame, contact: frame.nullish() })).min(1).max(10),
  })
  .superRefine((s, ctx) => {
    s.attempts.forEach((a, i) => {
      const t = flightTime(a.takeoff, a.landing, s.fps);
      if (!(t > 0) || t > 1.5) ctx.addIssue({ code: "custom", path: ["attempts", i], message: "El aterrizaje debe ir después del despegue (vuelo ≤ 1,5 s)" });
      if (s.type === "dj") {
        if (a.contact == null) ctx.addIssue({ code: "custom", path: ["attempts", i], message: "Marca el contacto del salto desde cajón" });
        else {
          const c = contactTime(a.contact, a.takeoff, s.fps);
          if (!(c > 0) || c > 2) ctx.addIssue({ code: "custom", path: ["attempts", i], message: "El contacto debe ir antes del despegue (≤ 2 s)" });
        }
      }
    });
  });
export type JumpSession = z.infer<typeof jumpSessionSchema>;
