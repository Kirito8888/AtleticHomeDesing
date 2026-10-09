// v1.6 · Plan de estudio hasta los exámenes, notas con media ponderada y clases en el .ics. Puro (sin BD).
import { z } from "zod";

import { addDays, dateOnly, toIsoDay } from "@/lib/dates";

import { type Slot, slotsOnDay } from "./schedule";

export type ExamTarget = { id: string; subject: string; date: string; minutes: number };
export type PlanBlock = { examId: string; subject: string; date: string; minutes: number };

/**
 * Minutos de estudio disponibles un día: el tope diario menos la mitad de las horas
 * de clase y menos un recorte si hay entreno. Nunca negativo.
 */
export function dayCapacity(o: { dailyMin: number; classMin: number; training: boolean; trainingCutMin: number }): number {
  return Math.max(0, o.dailyMin - Math.round(o.classMin / 2) - (o.training ? o.trainingCutMin : 0));
}

/**
 * Reparte los minutos de cada examen entre los días que quedan (desde `today` hasta su
 * víspera) en bloques de `blockMin`. Primero el examen más cercano, para que nunca se quede
 * corto por uno lejano; dentro de cada examen, bloque a bloque en el día más libre (a
 * igualdad, el más cercano al examen), así queda repartido. La víspera de un examen es
 * solo para esa asignatura. Lo que no cabe se devuelve en `shortfall`: se dice, no se esconde.
 */
export function planStudy(o: {
  exams: ExamTarget[];
  today: string;
  capacity: (day: string) => number;
  blockMin?: number;
}): { blocks: PlanBlock[]; shortfall: Array<{ examId: string; subject: string; minutes: number }> } {
  const block = o.blockMin ?? 30;
  const exams = o.exams.filter((e) => e.date > o.today).sort((a, b) => a.date.localeCompare(b.date) || a.subject.localeCompare(b.subject));
  const eveOf = (e: ExamTarget) => toIsoDay(addDays(dateOnly(e.date), -1));
  const free = new Map<string, number>();
  const capLeft = (day: string) => free.get(day) ?? free.set(day, Math.max(0, o.capacity(day))).get(day)!;
  const out = new Map<string, PlanBlock>();
  const shortfall: Array<{ examId: string; subject: string; minutes: number }> = [];
  for (const e of exams) {
    const days: string[] = [];
    for (let d = dateOnly(o.today); toIsoDay(d) < e.date; d = addDays(d, 1)) {
      const day = toIsoDay(d);
      // la víspera de otro examen (de otra fecha) es solo para ese
      if (!exams.some((x) => x.date !== e.date && eveOf(x) === day)) days.push(day);
    }
    let pending = Math.max(0, e.minutes);
    while (pending > 0) {
      const day = days.filter((d) => capLeft(d) >= Math.min(block, pending)).sort((a, b) => capLeft(b) - capLeft(a) || b.localeCompare(a))[0];
      if (!day) break;
      const give = Math.min(block, pending);
      free.set(day, capLeft(day) - give);
      pending -= give;
      const key = `${day}|${e.id}`;
      const cur = out.get(key) ?? { examId: e.id, subject: e.subject, date: day, minutes: 0 };
      cur.minutes += give;
      out.set(key, cur);
    }
    if (pending > 0) shortfall.push({ examId: e.id, subject: e.subject, minutes: pending });
  }
  return { blocks: [...out.values()].sort((a, b) => a.date.localeCompare(b.date) || a.subject.localeCompare(b.subject)), shortfall };
}

/** Qué bloques de un día quedan tachados con los minutos estudiados de esa asignatura (en orden). */
export function blocksToTick(blocks: Array<{ id: string; minutes: number; done: boolean }>, studiedMin: number): string[] {
  let left = studiedMin - blocks.filter((b) => b.done).reduce((a, b) => a + b.minutes, 0);
  const out: string[] = [];
  for (const b of blocks.filter((x) => !x.done)) {
    if (left < b.minutes) break;
    left -= b.minutes;
    out.push(b.id);
  }
  return out;
}

export const examPlanSchema = z.object({
  /** Horas que quieres dedicar a cada examen (por id). */
  hours: z.record(z.string().max(40), z.number().min(0).max(300)),
});

// ---------- 23 · Notas y créditos ----------
export const gradeSchema = z.object({
  subject: z.string().trim().min(1).max(80),
  term: z.string().trim().max(40).nullish(),
  grade: z.number().min(0).max(10).nullish(),
  credits: z.number().min(0.5).max(30).default(6),
});

/** Media ponderada por créditos (solo asignaturas con nota) y créditos aprobados (≥ 5). */
export function gradeAverage(rows: Array<{ grade: number | null; credits: number }>) {
  const graded = rows.filter((r) => r.grade != null);
  const credits = graded.reduce((a, r) => a + r.credits, 0);
  return {
    average: credits ? Math.round((graded.reduce((a, r) => a + r.grade! * r.credits, 0) / credits) * 100) / 100 : null,
    gradedCredits: credits,
    passedCredits: graded.filter((r) => r.grade! >= 5).reduce((a, r) => a + r.credits, 0),
    pendingCredits: rows.filter((r) => r.grade == null).reduce((a, r) => a + r.credits, 0),
  };
}

// ---------- 24 · Clases y exámenes en el .ics ----------

/** Fecha UTC de una hora local de Madrid (`min` = minutos desde las 00:00), con su horario de verano. */
export function madridToUtc(day: string, min: number): Date {
  const guess = Date.parse(`${day}T00:00:00Z`) + min * 60_000;
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Madrid", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(new Date(guess));
  const p = (t: string) => Number(parts.find((x) => x.type === t)!.value);
  const asLocal = Date.UTC(p("year"), p("month") - 1, p("day"), p("hour"), p("minute"));
  return new Date(guess - (asLocal - guess));
}

/** Clases (expandidas día a día) y exámenes entre `from` y `from + days`. Solo asignatura: ni aula ni notas. */
export function studyIcsEvents(slots: Slot[], from: string, days: number) {
  const out: Array<{ uid: string; title: string; start: Date; end: Date; allDay: false }> = [];
  for (let i = 0; i <= days; i++) {
    const day = toIsoDay(addDays(dateOnly(from), i));
    for (const s of slotsOnDay(slots, day))
      out.push({ uid: `c-${s.id}-${day}`, title: `${s.kind === "EXAM" ? "Examen" : "Clase"}: ${s.subject}`, start: madridToUtc(day, s.startMin), end: madridToUtc(day, s.endMin), allDay: false });
  }
  return out;
}
