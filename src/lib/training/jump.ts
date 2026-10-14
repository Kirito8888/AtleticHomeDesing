import { z } from "zod";

/**
 * Medidor de salto por vídeo: tiempo de vuelo contado en fotogramas (método validado en
 * Balsalobre-Fernández et al., 2015). El vídeo se procesa en el navegador; aquí solo hay
 * fórmulas puras que usan cliente y servidor (el servidor recalcula antes de guardar).
 */

export const G = 9.81;
export const CAPTURE_FPS = [240, 120, 60, 30] as const;
export type CaptureFps = (typeof CAPTURE_FPS)[number];

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

/** Con menos de 120 fps, error esperado de ±1 fotograma en la altura (cm) para el vuelo medido. */
export function fpsWarning(fps: number, flightS?: number): string | null {
  if (fps >= 120) return null;
  const t = flightS && flightS > 0 ? flightS : 0.5;
  const err = (Math.abs(jumpHeight(t + 1 / fps) - jumpHeight(t)) * 100).toFixed(1).replace(".", ",");
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
    fps: z.union(CAPTURE_FPS.map((f) => z.literal(f)) as unknown as [z.ZodLiteral<240>, z.ZodLiteral<120>, z.ZodLiteral<60>, z.ZodLiteral<30>]),
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
