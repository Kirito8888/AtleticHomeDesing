// Agenda de un día para la vista de calendario: sesiones, eventos, tareas y
// ciclos que lo cubren. Puro (recibe las filas ya consultadas) para poder probarlo.
import { localDay, toIsoDay } from "@/lib/dates";

export interface AgendaInput {
  sessions: Array<{ id: string; date: Date; title: string | null; type: string; status: string; tss: number | null }>;
  events: Array<{ id: string; type: string; title: string; startAt: Date; endAt: Date | null; allDay: boolean }>;
  tasks: Array<{ id: string; title: string; dueDate: Date | null; status: string; priority: string }>;
  cycles: Array<{ id: string; name: string; level: string; startDate: Date; endDate: Date }>;
}

/** Día de un evento: los de "todo el día" se guardan a medianoche UTC; los demás, en hora de Madrid. */
const eventDay = (d: Date, allDay: boolean) => (allDay ? toIsoDay(d) : localDay(d));

export function agendaForDay(day: string, input: AgendaInput) {
  return {
    day,
    sessions: input.sessions.filter((s) => toIsoDay(s.date) === day),
    events: input.events.filter((e) => eventDay(e.startAt, e.allDay) <= day && eventDay(e.endAt ?? e.startAt, e.allDay) >= day),
    tasks: input.tasks.filter((t) => t.dueDate && toIsoDay(t.dueDate) === day && t.status !== "DONE"),
    cycles: input.cycles.filter((c) => toIsoDay(c.startDate) <= day && toIsoDay(c.endDate) >= day),
  };
}

/** Número de tareas pendientes que vencen cada día (para marcar las celdas del mes). */
export function tasksDuePerDay(tasks: AgendaInput["tasks"]): Map<string, number> {
  const m = new Map<string, number>();
  for (const t of tasks) {
    if (!t.dueDate || t.status === "DONE") continue;
    const d = toIsoDay(t.dueDate);
    m.set(d, (m.get(d) ?? 0) + 1);
  }
  return m;
}
