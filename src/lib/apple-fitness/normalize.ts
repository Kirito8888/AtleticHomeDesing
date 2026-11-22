import { localDay } from "@/lib/dates";

import type { WorkoutInput } from "./payload";

export type AppleModality = "RUN" | "WALK" | "CYCLE" | "SWIM" | "ROW" | "OTHER";

const norm = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();

/** Por palabra clave, en español e inglés (Fitness las muestra en el idioma del iPhone). Sin acierto → OTHER. */
const RULES: [AppleModality, RegExp][] = [
  ["SWIM", /nata|swim/],
  ["CYCLE", /cicl|bici|cycl|biking/],
  ["ROW", /remo|rowing|row\b/],
  ["WALK", /camin|senderis|walk|hik/],
  ["RUN", /correr|carrera|running|run\b|jog|trote/],
];

export function mapModality(type: string): AppleModality {
  const t = norm(type);
  return RULES.find(([, re]) => re.test(t))?.[0] ?? "OTHER";
}

export interface NormalizedWorkout {
  /** Día de calendario en Madrid del inicio. */
  date: string;
  startedAt: Date;
  endedAt: Date | null;
  activityName: string;
  modality: AppleModality;
  durationSec: number;
  distanceM: number | null;
  hrAvg: number | null;
  hrMax: number | null;
  kcal: number | null;
  /** Idempotencia: día|inicio (UTC, al minuto)|modalidad. «Correr» y «Running» dan la misma clave. */
  dedupeKey: string;
}

const round = (n: number | null | undefined) => (n == null ? null : Math.round(n));

export function normalizeWorkout(w: WorkoutInput): NormalizedWorkout {
  const startedAt = new Date(w.start);
  const endedAt = w.end ? new Date(w.end) : null;
  const durationSec = Math.round(w.durationSec ?? (w.durationMin != null ? w.durationMin * 60 : (endedAt!.getTime() - startedAt.getTime()) / 1000));
  const modality = mapModality(w.type);
  const date = localDay(startedAt);
  const distanceM = w.distanceM ?? (w.distanceKm != null ? w.distanceKm * 1000 : null);
  return {
    date,
    startedAt,
    endedAt,
    activityName: (w.name?.trim() || w.type).slice(0, 120),
    modality,
    durationSec: Math.min(86_400, Math.max(30, durationSec)),
    distanceM: distanceM != null && distanceM > 0 ? Math.round(distanceM) : null,
    hrAvg: round(w.hrAvg),
    hrMax: round(w.hrMax),
    kcal: round(w.kcal),
    dedupeKey: `${date}|${startedAt.toISOString().slice(0, 16)}|${modality}`,
  };
}
