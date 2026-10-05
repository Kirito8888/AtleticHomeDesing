import { BookOpen, Dumbbell, GraduationCap, Timer, TrendingDown, Trophy, CircleDot, BatteryLow } from "lucide-react";

export const EVENT_META = {
  COMPETITION: { label: "Competición", icon: Trophy },
  TEST_1RM: { label: "Test de 1RM", icon: Dumbbell },
  TIME_TRIAL: { label: "Toma de marca", icon: Timer },
  TAPER: { label: "Tapering", icon: TrendingDown },
  DELOAD: { label: "Descarga", icon: BatteryLow },
  STUDY_BLOCK: { label: "Bloque de estudio", icon: BookOpen },
  EXAM: { label: "Examen", icon: GraduationCap },
  OTHER: { label: "Otro", icon: CircleDot },
} as const;

export type EventType = keyof typeof EVENT_META;

/** Color por nivel (identidad): macro, meso, micro = series 1–3 validadas. */
export const LEVEL_META = {
  MACRO: { label: "Macrociclo", color: "var(--series-1)" },
  MESO: { label: "Mesociclo", color: "var(--series-2)" },
  MICRO: { label: "Microciclo", color: "var(--series-3)" },
} as const;

export const PHASE_LABEL: Record<string, string> = {
  GENERAL_PREP: "Preparación general",
  SPECIFIC_PREP: "Preparación específica",
  PRE_COMPETITION: "Precompetitivo",
  COMPETITION: "Competitivo",
  TAPER: "Tapering",
  DELOAD: "Descarga",
  TRANSITION: "Transición",
};

export const PRIORITY_LABEL = { URGENT: "Urgente", HIGH: "Alta", MEDIUM: "Media", LOW: "Baja" } as const;
