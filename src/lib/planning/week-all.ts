import { addDays, dateOnly, toIsoDay } from "@/lib/dates";

export type WeekKind = "training" | "class" | "exam" | "study" | "assignment" | "appointment" | "competition" | "event";
export type WeekItem = { date: string; min: number | null; kind: WeekKind; title: string; href?: string; done?: boolean };

export const WEEK_KIND_LABEL: Record<WeekKind, string> = {
  training: "Entreno",
  class: "Clase",
  exam: "Examen",
  study: "Estudio",
  assignment: "Entrega",
  appointment: "Cita",
  competition: "Competición",
  event: "Evento",
};

/** Los 7 días de la semana (lunes a domingo) con sus cosas ordenadas por hora (sin hora, al principio). Puro. */
export function groupWeek(items: WeekItem[], weekStart: string) {
  return Array.from({ length: 7 }, (_, i) => {
    const date = toIsoDay(addDays(dateOnly(weekStart), i));
    return {
      date,
      items: items.filter((x) => x.date === date).sort((a, b) => (a.min ?? -1) - (b.min ?? -1) || a.title.localeCompare(b.title, "es")),
    };
  });
}

/** Clases semanales que caen en esa semana (respetando el periodo de validez). Puro. */
export function classesInWeek(slots: Array<{ subject: string; weekday: number | null; startMin: number; validFrom: string | null; validTo: string | null; location: string | null }>, weekStart: string): WeekItem[] {
  return slots.flatMap((s) => {
    if (s.weekday == null) return [];
    const date = toIsoDay(addDays(dateOnly(weekStart), s.weekday));
    if ((s.validFrom && date < s.validFrom) || (s.validTo && date > s.validTo)) return [];
    return [{ date, min: s.startMin, kind: "class" as const, title: `${s.subject}${s.location ? ` · ${s.location}` : ""}` }];
  });
}

export const hhmm = (min: number) => `${String(Math.floor(min / 60)).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`;
