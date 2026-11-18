import type { DayTarget, MacroRule, Prefs } from "@/lib/rules/prefs";

import { carbTarget, type CarbDay } from "./carbs";

/** Tipo de sesión del día a efectos de macros. */
export type SessionKind = "long" | "high" | "strength" | "easy" | "rest";
export type TargetSource = "manual" | "session" | "weekday" | "legacy-carbs" | "training-factor" | "base";

export const SESSION_KIND_LABEL: Record<"rest" | "strength" | "high" | "long", string> = {
  rest: "Descanso",
  strength: "Fuerza",
  high: "Series / alta carga",
  long: "Tirada / competición",
};
export const WEEKDAY_LABEL = ["lunes", "martes", "miércoles", "jueves", "viernes", "sábado", "domingo"] as const;

export type SessionFacts = {
  type: string;
  hasStrength: boolean;
  hasTechnical: boolean;
  durationSec: number | null;
  sessionRpe: number | null;
  track: { modality: string; distanceM: number | null; intervals: number } | null;
};

type Thresholds = Pick<Prefs, "longRunMinKm" | "longRunMinMin" | "highLoadRpe">;

/** Prioridad: tirada/competición > series/alta carga > fuerza > otra sesión > descanso. */
export function sessionKind(sessions: SessionFacts[], hasCompetition: boolean, t: Thresholds): SessionKind {
  if (hasCompetition) return "long";
  if (!sessions.length) return "rest";
  const isLong = (s: SessionFacts) =>
    s.track != null &&
    (s.track.modality === "RUN" || s.track.modality === "WALK") &&
    ((s.track.distanceM ?? 0) >= t.longRunMinKm * 1000 || (s.durationSec ?? 0) >= t.longRunMinMin * 60);
  if (sessions.some(isLong)) return "long";
  const isHigh = (s: SessionFacts) =>
    s.hasTechnical ||
    (s.track != null && (s.track.intervals > 0 || s.track.modality === "SPRINT" || s.track.modality === "HURDLES")) ||
    (s.sessionRpe != null && s.sessionRpe >= t.highLoadRpe);
  if (sessions.some(isHigh)) return "high";
  if (sessions.some((s) => s.hasStrength || s.type === "STRENGTH")) return "strength";
  return "easy";
}

/** 1 = lunes … 7 = domingo para un AAAA-MM-DD. */
export function weekdayOf(isoDay: string): number {
  const d = new Date(`${isoDay}T00:00:00Z`).getUTCDay();
  return d === 0 ? 7 : d;
}

export type BaseGoal = { kcal: number; proteinG: number; carbsG: number; fatG: number; fiberG: number | null; trainingDayKcalFactor: number };
export type ResolvedGoal = { kcal: number; proteinG: number; carbsG: number; fatG: number; fiberG: number | null };
export type ResolvedTarget = { goal: ResolvedGoal | null; source: TargetSource; kind: SessionKind; label: string; legacyCarbDay: boolean };

const KCAL_PER = { proteinG: 4, carbsG: 4, fatG: 9 } as const;

/** Aplica una regla a la base. kcal sin fijar = se derivan del cambio de macros (4/4/9). */
export function applyRule(base: BaseGoal, r: MacroRule): ResolvedGoal {
  const pick = (cur: number, v: number | null) => (v == null ? cur : Math.max(0, r.mode === "set" ? v : cur + v));
  const proteinG = pick(base.proteinG, r.proteinG);
  const carbsG = pick(base.carbsG, r.carbsG);
  const fatG = pick(base.fatG, r.fatG);
  const derived = base.kcal + (proteinG - base.proteinG) * KCAL_PER.proteinG + (carbsG - base.carbsG) * KCAL_PER.carbsG + (fatG - base.fatG) * KCAL_PER.fatG;
  const kcal = r.kcal == null ? derived : r.mode === "set" ? r.kcal : base.kcal + r.kcal;
  return { kcal: Math.max(0, Math.round(kcal)), proteinG, carbsG, fatG, fiberG: base.fiberG };
}

const hasEffect = (r: MacroRule | undefined): r is MacroRule => r != null && (r.kcal != null || r.proteinG != null || r.carbsG != null || r.fatG != null);

/** Etiqueta de una regla de sesión para la interfaz. */
const sessionLabel = (k: SessionKind) => (k === "rest" ? "Día de descanso" : k === "strength" ? "Día de fuerza" : k === "high" ? "Día de series / alta carga" : k === "long" ? "Día de tirada / competición" : "Día de entreno");

/**
 * Objetivo efectivo del día. Prioridad: marcado a mano > regla por sesión > regla por día de la semana >
 * hidratos antiguos (solo si no hay reglas nuevas) > base × factor de día de entreno > base.
 */
export function resolveDayTarget(a: {
  base: BaseGoal | null;
  trained: boolean;
  kind: SessionKind;
  isoDay: string;
  prefs: Pick<Prefs, "macroRules" | "nutritionDayTargets" | "carbsThrowDayG" | "carbsHeavyDayG" | "carbsRestDayG">;
  legacyKind: CarbDay;
}): ResolvedTarget {
  const { base, kind, isoDay, prefs } = a;
  const manual: DayTarget | undefined = prefs.nutritionDayTargets[isoDay];
  const none = { legacyCarbDay: false };
  if (manual) return { goal: { ...manual, fiberG: base?.fiberG ?? null }, source: "manual", kind, label: "Objetivo marcado a mano", ...none };
  if (!base) return { goal: null, source: "base", kind, label: "", ...none };

  const rules = prefs.macroRules;
  if (rules) {
    const bySession = kind === "easy" ? undefined : rules.bySession[kind];
    if (hasEffect(bySession)) return { goal: applyRule(base, bySession), source: "session", kind, label: sessionLabel(kind), ...none };
    const wd = weekdayOf(isoDay);
    const byDay = rules.byWeekday[String(wd) as "1"];
    if (hasEffect(byDay)) return { goal: applyRule(base, byDay), source: "weekday", kind, label: `Objetivo del ${WEEKDAY_LABEL[wd - 1]}`, ...none };
  } else {
    const c = carbTarget(prefs, a.legacyKind);
    if (c != null) {
      return {
        goal: { kcal: Math.round(base.kcal + (c - base.carbsG) * 4), carbsG: c, proteinG: base.proteinG, fatG: base.fatG, fiberG: base.fiberG },
        source: "legacy-carbs",
        kind,
        label: "",
        legacyCarbDay: true,
      };
    }
  }
  const factor = a.trained ? base.trainingDayKcalFactor : 1;
  return {
    goal: { kcal: Math.round(base.kcal * factor), carbsG: Math.round(base.carbsG + (base.kcal * (factor - 1)) / 4), proteinG: base.proteinG, fatG: base.fatG, fiberG: base.fiberG },
    source: factor !== 1 ? "training-factor" : "base",
    kind,
    label: a.trained ? "Día de entreno" : "",
    ...none,
  };
}

/** Quita los objetivos manuales de hace más de `keepDays` días. */
export function pruneDayTargets(m: Record<string, DayTarget>, todayIso: string, keepDays = 90): Record<string, DayTarget> {
  const min = new Date(new Date(`${todayIso}T00:00:00Z`).getTime() - keepDays * 86400000).toISOString().slice(0, 10);
  return Object.fromEntries(Object.entries(m).filter(([d]) => d >= min));
}
