import type { Prefs } from "@/lib/rules/prefs";

/** Tipo de día para los hidratos según las sesiones (hechas o planificadas) de ese día. */
export type CarbDay = "throw" | "heavy" | "rest" | "other";
export const CARB_DAY_LABEL: Record<CarbDay, string> = {
  throw: "día de lanzamientos",
  heavy: "día de gimnasio",
  rest: "día sin entreno",
  other: "día de entreno",
};

const THROWS = new Set(["JAVELIN", "SHOT_PUT", "DISCUS", "HAMMER", "WEIGHT_THROW", "OTHER"]);

export function carbDay(sessions: Array<{ event: string | null; strength: boolean }>): CarbDay {
  if (!sessions.length) return "rest";
  if (sessions.some((s) => s.event && THROWS.has(s.event))) return "throw";
  if (sessions.some((s) => s.strength)) return "heavy";
  return "other";
}

/** Hidratos objetivo del día según «Mis reglas» (null = no ajustar). */
export function carbTarget(p: Pick<Prefs, "carbsThrowDayG" | "carbsHeavyDayG" | "carbsRestDayG">, kind: CarbDay): number | null {
  return kind === "throw" ? p.carbsThrowDayG : kind === "heavy" ? p.carbsHeavyDayG : kind === "rest" ? p.carbsRestDayG : null;
}
