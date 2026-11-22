import { localDay } from "@/lib/dates";

import type { WorkoutInput } from "./payload";

export type AppleModality = "RUN" | "WALK" | "CYCLE" | "SWIM" | "ROW" | "OTHER";
/** Tipo de sesión de Atlenza con el que se crea al «Crear aparte». Nunca TECHNICAL (lanzamientos/saltos no los distingue un reloj). */
export type AppleSessionType = "TRACK" | "STRENGTH" | "MIXED";

const norm = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();

/**
 * Por palabra clave, en español e inglés (Fitness las muestra en el idioma del iPhone). El orden importa: la primera que acierta gana.
 * Sin acierto → TRACK + OTHER (respaldo seguro, el comportamiento del Bloque A).
 */
const RULES: [AppleModality, AppleSessionType, RegExp][] = [
  // Fuerza y mixtas primero: «fuerza funcional» o «core» no deben caer en otra modalidad por una palabra suelta
  ["OTHER", "STRENGTH", /fuerza|strength|pesas|weight ?lifting|musculacion|\bcore\b|abdominal|calistenia|calisthenics|flexibilidad con fuerza/],
  ["OTHER", "MIXED", /hiit|alta intensidad|high intensity|entrenamiento cruzado|cross ?training|crossfit|cardio mixto|mixed cardio|circuito|circuit|bootcamp|entrenamiento por intervalos/],
  ["SWIM", "TRACK", /nata|swim|aguas abiertas|open water/],
  ["CYCLE", "TRACK", /cicl|bici|cycl|biking|handcycl/],
  ["ROW", "TRACK", /remo|rowing|row\b|ergometro|ergometer/],
  ["WALK", "TRACK", /camin|senderis|walk|hik|paseo/],
  ["RUN", "TRACK", /correr|carrera|running|run\b|jog|trote|cinta de correr|treadmill/],
  // Cardio sin modalidad propia en Atlenza: pista/cardio genérico
  ["OTHER", "TRACK", /eliptic|elliptic|escaladora|stair|stepper|silla de ruedas|wheelchair|atletismo|track and field|esqui|ski|patin|skat/],
];

export function mapActivity(type: string): { modality: AppleModality; sessionType: AppleSessionType } {
  const t = norm(type);
  const r = RULES.find(([, , re]) => re.test(t));
  return { modality: r?.[0] ?? "OTHER", sessionType: r?.[1] ?? "TRACK" };
}

export const mapModality = (type: string): AppleModality => mapActivity(type).modality;
export const mapSessionType = (type: string): AppleSessionType => mapActivity(type).sessionType;

export interface NormalizedWorkout {
  /** Día de calendario en Madrid del inicio. */
  date: string;
  startedAt: Date;
  endedAt: Date | null;
  activityName: string;
  modality: AppleModality;
  /** Tipo de actividad tal como llegó (para volver a mapear). */
  activityType: string;
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
    activityType: w.type.slice(0, 60),
    durationSec: Math.min(86_400, Math.max(30, durationSec)),
    distanceM: distanceM != null && distanceM > 0 ? Math.round(distanceM) : null,
    hrAvg: round(w.hrAvg),
    hrMax: round(w.hrMax),
    kcal: round(w.kcal),
    dedupeKey: `${date}|${startedAt.toISOString().slice(0, 16)}|${modality}`,
  };
}
