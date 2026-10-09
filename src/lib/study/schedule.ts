// Horario de clases y exámenes, horas de estudio y hábitos. Puro (sin BD) para poder probarlo.
import { z } from "zod";

import { addDays, dateOnly, isoDate, toIsoDay } from "@/lib/dates";

const hhmm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Hora HH:MM");
export const WEEKDAY_NAMES = ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado", "Domingo"];
export const toMin = (s: string) => Number(s.slice(0, 2)) * 60 + Number(s.slice(3, 5));
export const fromMin = (m: number) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;

const base = {
  subject: z.string().trim().min(1).max(80),
  start: hhmm,
  end: hhmm,
  location: z.string().trim().max(80).optional(),
};
export const classSlotSchema = z
  .discriminatedUnion("kind", [
    z.object({ kind: z.literal("CLASS"), weekday: z.number().int().min(0).max(6), validFrom: isoDate.optional(), validTo: isoDate.optional(), ...base }),
    z.object({ kind: z.literal("EXAM"), date: isoDate, ...base }),
  ])
  .refine((s) => toMin(s.end) > toMin(s.start), { message: "La hora de fin debe ser posterior a la de inicio", path: ["end"] });
export type ClassSlotInput = z.infer<typeof classSlotSchema>;

export interface Slot {
  id: string;
  subject: string;
  kind: string;
  weekday: number | null;
  date: string | null;
  startMin: number;
  endMin: number;
  validFrom: string | null;
  validTo: string | null;
  location: string | null;
}

/** Lunes = 0 … domingo = 6. */
export const weekdayOf = (iso: string) => (dateOnly(iso).getUTCDay() + 6) % 7;

/** Clases y exámenes de un día, ordenados por hora. */
export function slotsOnDay(slots: Slot[], day: string): Slot[] {
  const wd = weekdayOf(day);
  return slots
    .filter((s) =>
      s.kind === "EXAM" ? s.date === day : s.weekday === wd && (!s.validFrom || s.validFrom <= day) && (!s.validTo || s.validTo >= day),
    )
    .sort((a, b) => a.startMin - b.startMin);
}

export interface ScheduleClash {
  id: string;
  date: string;
  title: string;
  subject: string;
  /** EXAM: sesión el mismo día del examen · EVE: sesión la víspera */
  kind: "EXAM" | "EVE";
}

/** Sesiones planificadas que caen el día de un examen o la víspera. */
export function examClashes(slots: Slot[], sessions: Array<{ id: string; date: string; title: string }>): ScheduleClash[] {
  const exams = slots.filter((s) => s.kind === "EXAM" && s.date);
  const out: ScheduleClash[] = [];
  for (const s of sessions) {
    const same = exams.find((e) => e.date === s.date);
    if (same) {
      out.push({ id: s.id, date: s.date, title: s.title, subject: same.subject, kind: "EXAM" });
      continue;
    }
    const eve = exams.find((e) => e.date === toIsoDay(addDays(dateOnly(s.date), 1)));
    if (eve) out.push({ id: s.id, date: s.date, title: s.title, subject: eve.subject, kind: "EVE" });
  }
  return out.sort((a, b) => a.date.localeCompare(b.date));
}

/** Minutos de clase de cada día (para ver qué días vas cargada de clases). */
export function classMinutes(slots: Slot[], day: string): number {
  return slotsOnDay(slots, day)
    .filter((s) => s.kind === "CLASS")
    .reduce((a, s) => a + s.endMin - s.startMin, 0);
}

// ---------- Estudio ----------

export const studySessionSchema = z.object({
  subject: z.string().trim().min(1).max(80),
  minutes: z.number().int().min(1).max(600),
  date: isoDate,
});

/** Minutos por día (lunes→domingo) y por asignatura de la semana que empieza en `weekStart`. */
export function studyWeek(rows: Array<{ subject: string; date: string; minutes: number }>, weekStart: string) {
  const days = Array.from({ length: 7 }, (_, i) => toIsoDay(addDays(dateOnly(weekStart), i)));
  const inWeek = rows.filter((r) => r.date >= days[0] && r.date <= days[6]);
  const bySubject = new Map<string, number>();
  for (const r of inWeek) bySubject.set(r.subject, (bySubject.get(r.subject) ?? 0) + r.minutes);
  return {
    days: days.map((d) => ({ date: d, minutes: inWeek.filter((r) => r.date === d).reduce((a, r) => a + r.minutes, 0) })),
    subjects: [...bySubject.entries()].map(([subject, minutes]) => ({ subject, minutes })).sort((a, b) => b.minutes - a.minutes),
    total: inWeek.reduce((a, r) => a + r.minutes, 0),
  };
}

// ---------- Hábitos ----------

export const habitSchema = z.object({ name: z.string().trim().min(1).max(60) });

/**
 * Racha actual (cuenta hoy si ya está hecho; si no, la de hasta ayer sigue viva),
 * mejor racha y los últimos 7 días.
 */
export function habitStreak(dates: string[], today: string) {
  const set = new Set(dates);
  let current = 0;
  let d = set.has(today) ? dateOnly(today) : addDays(dateOnly(today), -1);
  while (set.has(toIsoDay(d))) {
    current++;
    d = addDays(d, -1);
  }
  const sorted = [...set].sort();
  let best = 0;
  let run = 0;
  let prev: string | null = null;
  for (const x of sorted) {
    run = prev && toIsoDay(addDays(dateOnly(prev), 1)) === x ? run + 1 : 1;
    best = Math.max(best, run);
    prev = x;
  }
  const last7 = Array.from({ length: 7 }, (_, i) => {
    const day = toIsoDay(addDays(dateOnly(today), i - 6));
    return { date: day, done: set.has(day) };
  });
  return { current, best, doneToday: set.has(today), last7 };
}
