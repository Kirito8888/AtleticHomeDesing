// Convierte una sesión guardada en el estado inicial de <SessionForm> (editar o
// "repetir última sesión"). Solo tipos de los componentes cliente: sin código.
import type { ExerciseBlock } from "@/components/training/strength-logger";
import type { TechnicalState } from "@/components/training/technical-logger";
import type { TrackState } from "@/components/training/track-logger";
import { formatDuration } from "@/lib/format";
import { createSessionSchema } from "@/lib/training/schemas";

export type FormKind = "STRENGTH" | "TECHNICAL" | "TRACK";

export interface SessionFormInitial {
  type: FormKind;
  date: string;
  title: string;
  minutes: string;
  rpe: number | null;
  notes: string;
  planned: boolean;
  /** Sesión mixta: se guardan a la vez las partes de fuerza, técnica y pista que tengan datos. */
  mixed?: boolean;
  blocks?: ExerciseBlock[];
  technical?: TechnicalState;
  track?: TrackState;
}

interface StoredSession {
  type: string;
  date: Date;
  title: string | null;
  durationSec: number | null;
  sessionRpe: number | null;
  notes: string | null;
  status: string;
  strength: { sets: Array<{ exerciseId: string; reps: number; weightKg: number; rpe: number | null; isWarmup: boolean }> } | null;
  technical: {
    event: string;
    implementWeightG: number | null;
    approachType: string | null;
    approachSteps: number | null;
    isCompetition: boolean;
    focus: string | null;
    attempts: Array<{
      markM: number | null;
      isFoul: boolean;
      rating: number | null;
      windMs: number | null;
      runUpNotes: string | null;
      blockNotes: string | null;
      releaseNotes: string | null;
    }>;
  } | null;
  track: {
    modality: string;
    surface: string | null;
    distanceM: number | null;
    movingTimeSec: number | null;
    hrAvg: number | null;
    hrMax: number | null;
    intervals: Array<{ distanceM: number | null; timeSec: number | null; recoverySec: number | null }>;
  } | null;
}

/** Tipos con formulario (MIXED se edita con el interruptor «sesión mixta»). */
export const isEditableType = (type: string): boolean => type === "STRENGTH" || type === "TECHNICAL" || type === "TRACK" || type === "MIXED";
const isFormKind = (type: string): type is FormKind => type === "STRENGTH" || type === "TECHNICAL" || type === "TRACK";

/** "4:05" para tiempos enteros; "11.45" si hay décimas (sprints), que formatDuration redondearía. */
const dur = (sec: number | null) => (sec == null ? "" : Number.isInteger(sec) ? formatDuration(sec) : String(sec));

export function sessionToFormInitial(s: StoredSession, overrides: Partial<SessionFormInitial> = {}): SessionFormInitial {
  // MIXED: la pestaña inicial es la primera parte con datos.
  const type: FormKind = isFormKind(s.type) ? s.type : s.strength ? "STRENGTH" : s.technical ? "TECHNICAL" : s.track ? "TRACK" : "STRENGTH";
  const base: SessionFormInitial = {
    type,
    date: s.date.toISOString().slice(0, 10),
    title: s.title ?? "",
    minutes: s.durationSec != null ? String(Math.round(s.durationSec / 60)) : "",
    rpe: s.sessionRpe,
    notes: s.notes ?? "",
    planned: s.status === "PLANNED",
    mixed: s.type === "MIXED",
  };

  if (s.strength) {
    // Series consecutivas del mismo ejercicio → un bloque (como en el registro).
    const blocks: ExerciseBlock[] = [];
    for (const set of s.strength.sets) {
      const row = { reps: set.reps, weightKg: set.weightKg, rpe: set.rpe, isWarmup: set.isWarmup };
      const last = blocks.at(-1);
      if (last && last.exerciseId === set.exerciseId) last.sets.push(row);
      else blocks.push({ key: `srv${blocks.length}`, exerciseId: set.exerciseId, sets: [row] });
    }
    base.blocks = blocks;
  }
  if (s.technical) {
    const t = s.technical;
    base.technical = {
      event: t.event,
      implementWeightG: t.implementWeightG,
      approachType: t.approachType ?? "",
      approachSteps: t.approachSteps,
      isCompetition: t.isCompetition,
      focus: t.focus ?? "",
      // Ids negativos: no chocan con los que genera el cliente (1, 2, 3…).
      attempts: t.attempts.map((a, i) => ({
        id: -(i + 1),
        markM: a.markM,
        isFoul: a.isFoul,
        rating: a.rating,
        windMs: a.windMs,
        runUpNotes: a.runUpNotes ?? "",
        blockNotes: a.blockNotes ?? "",
        releaseNotes: a.releaseNotes ?? "",
      })),
    };
  }
  if (s.track) {
    const t = s.track;
    base.track = {
      modality: t.modality,
      surface: t.surface ?? "",
      distanceKm: t.distanceM != null ? String(t.distanceM / 1000) : "",
      time: dur(t.movingTimeSec),
      hrAvg: t.hrAvg != null ? String(t.hrAvg) : "",
      hrMax: t.hrMax != null ? String(t.hrMax) : "",
      intervals: t.intervals.map((iv) => ({
        distanceM: iv.distanceM != null ? String(iv.distanceM) : "",
        time: dur(iv.timeSec),
        recovery: dur(iv.recoverySec),
      })),
    };
  }
  return { ...base, ...overrides };
}

/**
 * Plantilla guardada (cuerpo de la API sin fecha) → estado inicial del formulario
 * para una fecha dada. Se valida con el mismo esquema que crear una sesión.
 */
export function templateToFormInitial(payload: unknown, date: string): SessionFormInitial {
  const p = createSessionSchema.parse({ ...(payload as object), date });
  const strength = "strength" in p ? p.strength : null;
  const technical = "technical" in p ? p.technical : null;
  const track = "track" in p ? p.track : null;
  return sessionToFormInitial(
    {
      type: p.type,
      date: new Date(`${date}T00:00:00Z`),
      title: p.title ?? null,
      durationSec: p.durationSec ?? null,
      sessionRpe: p.sessionRpe ?? null,
      notes: p.notes ?? null,
      status: p.status,
      strength: strength
        ? { sets: strength.sets.map((x) => ({ exerciseId: x.exerciseId, reps: x.reps, weightKg: x.weightKg, rpe: x.rpe ?? null, isWarmup: x.isWarmup })) }
        : null,
      technical: technical
        ? {
            event: technical.event,
            implementWeightG: technical.implementWeightG ?? null,
            approachType: technical.approachType ?? null,
            approachSteps: technical.approachSteps ?? null,
            isCompetition: technical.isCompetition,
            focus: technical.focus ?? null,
            attempts: technical.attempts.map((a) => ({
              markM: a.markM ?? null,
              isFoul: a.isFoul,
              rating: a.rating ?? null,
              windMs: a.windMs ?? null,
              runUpNotes: a.runUpNotes ?? null,
              blockNotes: a.blockNotes ?? null,
              releaseNotes: a.releaseNotes ?? null,
            })),
          }
        : null,
      track: track
        ? {
            modality: track.modality,
            surface: track.surface ?? null,
            distanceM: track.distanceM ?? null,
            movingTimeSec: track.movingTimeSec ?? null,
            hrAvg: track.hrAvg ?? null,
            hrMax: track.hrMax ?? null,
            intervals: track.intervals.map((iv) => ({ distanceM: iv.distanceM ?? null, timeSec: iv.timeSec ?? null, recoverySec: iv.recoverySec ?? null })),
          }
        : null,
    },
    { date },
  );
}
