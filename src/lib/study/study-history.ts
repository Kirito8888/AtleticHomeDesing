import { z } from "zod";

import { clampPreset } from "@/lib/study/micro-timer";

/**
 * v2.9 · Histórico de autoevaluación y de micro-pasos (N3). Parte pura y compartida cliente/servidor:
 * validación de lo que entra a la BD y conversión de lo que había en localStorage (importación sin pérdida).
 */
export const SELF_TEST_KEY_PREFIX = "atlenza.study.selfTest.";
export const MICRO_KEY = "atlenza.study.microRun";
export const selfTestKey = (moduleId: string) => `${SELF_TEST_KEY_PREFIX}${moduleId}`;

const DAY = 86_400_000;
const text = (max: number) => z.string().trim().min(1).max(max);

export const selfTestAttemptSchema = z.object({
  /** Hora del intento en el cliente: junto a la usuaria y la asignatura, es la clave de idempotencia. */
  takenAt: z.coerce.date().refine((d) => d.getTime() <= Date.now() + DAY, "fecha futura"),
  score: z.number().min(0).max(10),
  label: text(80),
  questions: z.number().int().min(1).max(60).nullish(),
  weak: z.array(text(200)).max(40),
  answers: z.array(z.object({ topic: text(200), tag: z.enum(["red", "yellow", "grey"]), score: z.union([z.literal(0), z.literal(0.5), z.literal(1)]) })).max(60).nullish(),
  imported: z.boolean().default(false),
});
export type SelfTestAttemptInput = z.infer<typeof selfTestAttemptSchema>;

export const selfTestBatchSchema = z.object({ attempts: z.array(selfTestAttemptSchema).min(1).max(10) });

export const microSessionSchema = z
  .object({
    clientKey: text(80),
    title: text(300),
    steps: z.array(z.object({ n: z.number().int().min(1).max(30), action: text(4000), minutes: z.number().min(0).max(600) })).min(1).max(30),
    stepsDone: z.number().int().min(0).max(30),
    focusMin: z.number().int().min(1).max(60),
    restMin: z.number().int().min(1).max(30),
    completedAt: z.coerce.date().refine((d) => d.getTime() <= Date.now() + DAY, "fecha futura"),
    imported: z.boolean().default(false),
  })
  .refine((v) => v.stepsDone <= v.steps.length, { message: "stepsDone supera los pasos", path: ["stepsDone"] });
export type MicroSessionInput = z.infer<typeof microSessionSchema>;

/** Lo que `SelfTest` guardaba en localStorage (sin respuestas ni nº de preguntas). */
export interface LegacyAttempt {
  score: number;
  label: string;
  weak: string[];
  at: string;
}

/** Valida el JSON de localStorage y lo convierte en intento importado; null si no es utilizable. */
export function attemptFromLegacy(raw: unknown): SelfTestAttemptInput | null {
  const r = raw as Partial<LegacyAttempt> | null;
  if (!r || typeof r !== "object") return null;
  const p = selfTestAttemptSchema.safeParse({ takenAt: r.at, score: r.score, label: r.label, weak: Array.isArray(r.weak) ? r.weak.filter((w) => typeof w === "string" && w.trim()) : [], imported: true });
  return p.success ? p.data : null;
}

/** Forma que `MicroStepsPanel` guarda en localStorage (se amplía con `key`, `syncedKey` y `completedAt`). */
export interface SavedMicro {
  steps: { title: string; steps: Array<{ n: number; action: string; minutes: number }> };
  preset: string;
  done: number[];
  key?: string;
  syncedKey?: string;
  completedAt?: number;
}

/** Hash FNV-1a estable (no criptográfico) para dar clave a una sesión antigua sin `key`. */
export function stableHash(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(36);
}
export const legacyMicroKey = (v: SavedMicro) => `legacy:${stableHash(JSON.stringify([v.steps.title, v.steps.steps.map((s) => [s.n, s.action, s.minutes]), [...new Set(v.done)].sort()]))}`;

/** Clave de la sesión: la del cliente si existe, y si no la derivada del contenido. */
export const microKeyOf = (v: SavedMicro) => v.key ?? legacyMicroKey(v);

/** True solo si todos los pasos están hechos: una sesión a medias NO es histórico (sigue local hasta terminarse). */
export function isMicroFinished(v: SavedMicro | null | undefined): v is SavedMicro {
  const total = v?.steps?.steps?.length ?? 0;
  return total > 0 && new Set(v!.done ?? []).size >= total;
}

/** Sesión terminada → entrada para la BD; null si está a medias, ya sincronizada o inválida. */
export function microSessionFromSaved(v: SavedMicro | null | undefined, now = Date.now()): MicroSessionInput | null {
  if (!isMicroFinished(v)) return null;
  const clientKey = microKeyOf(v);
  if (v.syncedKey === clientKey) return null;
  const [f, r] = v.preset.split("/").map(Number);
  const p = clampPreset({ focus: f, rest: r });
  const parsed = microSessionSchema.safeParse({
    clientKey,
    title: v.steps.title,
    steps: v.steps.steps.map((s) => ({ n: s.n, action: s.action, minutes: s.minutes })),
    stepsDone: new Set(v.done).size,
    focusMin: p.focus,
    restMin: p.rest,
    completedAt: new Date(v.completedAt ?? now),
    imported: v.key === undefined,
  });
  return parsed.success ? parsed.data : null;
}
