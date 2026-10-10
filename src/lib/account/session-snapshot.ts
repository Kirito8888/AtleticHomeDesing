import "server-only";

import { Prisma } from "@/generated/prisma/client";
import { createSessionSchema } from "@/lib/training/schemas";

type Row = Record<string, unknown>;
const arr = (v: unknown): Row[] => (Array.isArray(v) ? (v as Row[]) : []);
const get = (o: unknown, ...path: string[]): unknown => path.reduce<unknown>((a, k) => (a && typeof a === "object" ? (a as Row)[k] : undefined), o);
const day = (v: unknown) => (typeof v === "string" ? v.slice(0, 10) : v instanceof Date ? v.toISOString().slice(0, 10) : null);
/** Columnas que existen en la tabla, sin id ni claves de la fila original. */
export function pick(row: Row, fields: Record<string, string>, drop: string[] = []): Row {
  const out: Row = {};
  for (const k of Object.keys(fields)) if (!["id", "userId", "createdAt", "updatedAt", ...drop].includes(k) && row[k] != null) out[k] = row[k];
  return out;
}

/** Incluye lo necesario para reconstruir una sesión (exportación y papelera). */
export const SESSION_SNAPSHOT_INCLUDE = {
  track: { include: { intervals: true } },
  technical: { include: { attempts: true } },
  strength: { include: { sets: { include: { exercise: { select: { name: true } } } } } },
} as const;

/**
 * Sesión exportada (o guardada en la papelera) → entrada validada de `createTrainingSession`, para
 * volver a crearla con TSS y marcas recalculados. `exerciseId` decide a qué ejercicio va cada serie
 * (null = la serie se descarta). Con `full`, conserva también ciclo, inicio y disciplina.
 */
export function sessionInputFromSnapshot(s: Row, exerciseId: (set: Row) => string | null, full = false) {
  const track = s.track as Row | null;
  const tech = s.technical as Row | null;
  const str = s.strength as Row | null;
  const sets = arr(get(str, "sets")).flatMap((x) => {
    const id = exerciseId(x);
    return id ? [{ exerciseId: id, reps: x.reps, weightKg: x.weightKg, rpe: x.rpe, rir: x.rir, isWarmup: x.isWarmup, velocityMs: x.velocityMs, suggestedKg: x.suggestedKg }] : [];
  });
  const input = {
    date: day(s.date),
    type: s.type,
    status: s.status,
    title: s.title,
    durationSec: s.durationSec,
    sessionRpe: s.sessionRpe,
    notes: s.notes,
    feelings: s.feelings ?? null,
    zoneFatigue: s.zoneFatigue ?? null,
    tags: Array.isArray(s.tags) ? s.tags : [],
    ...(full ? { cycleId: s.cycleId ?? null, startedAt: s.startedAt ? new Date(s.startedAt as string).toISOString() : null, discipline: s.discipline ?? null, manualTss: s.tssMethod === "MANUAL" ? s.tss : null } : {}),
    ...(track ? { track: { ...pick(track, Prisma.TrackSessionScalarFieldEnum, ["sessionId"]), intervals: arr(track.intervals).map((i) => pick(i, Prisma.TrackIntervalScalarFieldEnum, ["trackSessionId"])) } } : {}),
    ...(tech ? { technical: { ...pick(tech, Prisma.TechnicalSessionScalarFieldEnum, ["sessionId", "bestMarkM", "conditions"]), attempts: arr(tech.attempts).map((a) => pick(a, Prisma.TechnicalAttemptScalarFieldEnum, ["technicalSessionId", "order"])) } } : {}),
    ...(str ? { strength: { bodyWeightKg: str.bodyWeightKg ?? null, sets } } : {}),
  };
  return { date: input.date, parsed: createSessionSchema.safeParse(JSON.parse(JSON.stringify(input, (_k, v) => (v === null ? undefined : v)))) };
}
