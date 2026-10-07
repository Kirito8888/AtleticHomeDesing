import type { Prefs } from "@/lib/rules/prefs";

/** Qué recordatorios tocan ahora (puro). weekday: 0 = lunes … 6 = domingo; hour: hora de Madrid. */
export type ReminderKind = "tomorrow" | "monday-check" | "weigh";

export function dueReminders(
  p: Pick<Prefs, "remindTomorrowHour" | "remindMondayCheck" | "remindWeigh">,
  now: { hour: number; weekday: number },
  state: { plannedTomorrow: number; checkedToday: boolean; weighedToday: boolean },
): ReminderKind[] {
  const out: ReminderKind[] = [];
  if (p.remindTomorrowHour != null && now.hour >= p.remindTomorrowHour && state.plannedTomorrow > 0) out.push("tomorrow");
  if (p.remindMondayCheck && now.weekday === 0 && now.hour >= 8 && !state.checkedToday) out.push("monday-check");
  if (p.remindWeigh && [0, 2, 4].includes(now.weekday) && now.hour >= 7 && now.hour < 12 && !state.weighedToday) out.push("weigh");
  return out;
}

/** «(versión suave)» puede delatar síntomas en la pantalla bloqueada: fuera. */
export const publicTitle = (t: string) => t.replace(/\s*\(versión suave\)\s*/gi, " ").trim();
