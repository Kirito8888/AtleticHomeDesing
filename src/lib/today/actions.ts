// =============================================================================
// v3.0 H · «Hoy»: qué hacer ahora. Lógica pura (sin BD ni `server-only`): recibe lo que ya
// carga `getDashboard` y devuelve, por orden de prioridad, la acción principal y las demás.
// Respeta `hiddenModules`; el aviso de recuperación solo sale si el módulo está visible.
// =============================================================================

export type TodayAction = { id: "recovery" | "session" | "review" | "meal" | "cards"; title: string; detail: string; why: string; href: string; cta: string };

export interface TodayInput {
  sessions: Array<{ id: string; title: string | null; status: string; durationSec: number | null }>;
  dueCards: number;
  /** Tomas (MealType) con alguna entrada hoy. */
  mealsLogged: string[];
  /** Hora local (Europe/Madrid) y día de la semana (0 = domingo). */
  hour: number;
  weekday: number;
  reviewed: boolean;
  light: { level: "green" | "amber" | "red"; label: string; reasons: string[] };
  hidden: readonly string[];
  /** Frase de por qué de la sesión (PMC) si hay carga calculada. */
  pmcWhy?: string | null;
}

/** Toma que toca según la hora (misma escala que `defaultMeal` de la interfaz). */
export function mealForHour(hour: number): "BREAKFAST" | "MID_MORNING" | "LUNCH" | "SNACK" | "DINNER" {
  if (hour < 11) return "BREAKFAST";
  if (hour < 13) return "MID_MORNING";
  if (hour < 16) return "LUNCH";
  if (hour < 20) return "SNACK";
  return "DINNER";
}

export const MEAL_NAME: Record<string, string> = { BREAKFAST: "el desayuno", MID_MORNING: "la media mañana", LUNCH: "la comida", SNACK: "la merienda", DINNER: "la cena" };

export function todayActions(i: TodayInput): { main: TodayAction | null; rest: TodayAction[] } {
  const on = (m: string) => !i.hidden.includes(m);
  const out: TodayAction[] = [];
  if (on("recovery") && i.light.level !== "green") {
    out.push({
      id: "recovery",
      title: i.light.label,
      detail: i.light.reasons.join(" · "),
      why: "Sale de tu recuperación de hoy (readiness, molestias, fatiga por zona): no es un diagnóstico.",
      href: "/recovery",
      cta: "Ver recuperación",
    });
  }
  const planned = i.sessions.find((s) => s.status === "PLANNED");
  if (on("training") && planned) {
    out.push({
      id: "session",
      title: planned.title ?? "Tu sesión de hoy",
      detail: planned.durationSec ? `~${Math.round(planned.durationSec / 60)} min · planificada` : "Planificada para hoy",
      why: i.pmcWhy ?? "Está en tu plan de hoy; al guardarla se anota como hecha y alimenta tu carga.",
      href: `/training/${planned.id}`,
      cta: "Abrir sesión",
    });
  }
  if (!i.reviewed && [0, 6].includes(i.weekday)) {
    out.push({ id: "review", title: "Toca la revisión semanal", detail: "5 minutos", why: "Cerrar la semana te deja un foco claro para la siguiente.", href: "/review", cta: "Hacer la revisión" });
  }
  const meal = mealForHour(i.hour);
  if (on("nutrition") && i.hour >= 6 && i.hour < 23 && !i.mealsLogged.includes(meal)) {
    out.push({ id: "meal", title: `Apunta ${MEAL_NAME[meal]}`, detail: "Aún sin registrar", why: "Con lo que comes ves si llegas a tu objetivo del día.", href: "/nutrition", cta: "Ir a Nutrición" });
  }
  if (on("study") && i.dueCards > 0) {
    out.push({
      id: "cards",
      title: `${i.dueCards} ${i.dueCards === 1 ? "repaso vencido" : "repasos vencidos"}`,
      detail: "Flashcards",
      why: "Repasar justo cuando toca fija lo estudiado con menos tiempo.",
      href: "/study",
      cta: "Repasar",
    });
  }
  return { main: out[0] ?? null, rest: out.slice(1, 4) };
}
