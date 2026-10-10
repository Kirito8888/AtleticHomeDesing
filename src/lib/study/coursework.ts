// v1.7 · Estudio: tarjetas de repaso a mano (sin IA, SM-2), trabajos y entregas, y estadísticas de
// concentración por franja horaria. Puro (sin BD).
import { z } from "zod";

import { dateOnly, isoDate } from "@/lib/dates";

// 22 · Tarjetas a mano ---------------------------------------------------------------------------
export const manualCardSchema = z.object({
  deck: z.string().trim().min(1).max(60),
  subject: z.string().trim().max(60).nullish(),
  front: z.string().trim().min(1).max(500),
  back: z.string().trim().min(1).max(1000),
});

/** Varias tarjetas pegadas como líneas «pregunta | respuesta» (o con tabulador). */
export function parseCardLines(text: string) {
  return text
    .split(/\r?\n/)
    .map((l) => l.split(/\s*\|\s*|\t/))
    .filter((p) => p.length >= 2 && p[0].trim() && p.slice(1).join(" | ").trim())
    .map((p) => ({ front: p[0].trim().slice(0, 500), back: p.slice(1).join(" | ").trim().slice(0, 1000) }))
    .slice(0, 200);
}

// 23 · Trabajos y entregas -----------------------------------------------------------------------
export const ASSIGNMENT_STATUS = { TODO: "Por empezar", DOING: "En marcha", DONE: "Entregado" } as const;
export type AssignmentStatus = keyof typeof ASSIGNMENT_STATUS;
export const assignmentSchema = z.object({
  subject: z.string().trim().min(1).max(60),
  title: z.string().trim().min(1).max(120),
  dueOn: isoDate,
  status: z.enum(Object.keys(ASSIGNMENT_STATUS) as [AssignmentStatus, ...AssignmentStatus[]]).default("TODO"),
  weightPct: z.number().int().min(0).max(100).nullish(),
  grade: z.number().min(0).max(10).nullish(),
  notes: z.string().trim().max(300).nullish(),
});

/** Días que quedan y aviso: vencido, esta semana o sin empezar a menos de 3 días. */
export function assignmentAlert(a: { dueOn: string; status: AssignmentStatus }, today: string) {
  const days = Math.round((dateOnly(a.dueOn).getTime() - dateOnly(today).getTime()) / 864e5);
  if (a.status === "DONE") return { days, level: "ok" as const, text: "Entregado" };
  if (days < 0) return { days, level: "red" as const, text: `Vencido hace ${-days} d` };
  if (days <= 3 && a.status === "TODO") return { days, level: "red" as const, text: days === 0 ? "Hoy y sin empezar" : `En ${days} d y sin empezar` };
  if (days <= 7) return { days, level: "amber" as const, text: days === 0 ? "Hoy" : `En ${days} d` };
  return { days, level: "ok" as const, text: `En ${days} d` };
}

/** Nota media ponderada por asignatura con lo ya calificado (y qué % del total está calificado). */
export function subjectAverages(rows: Array<{ subject: string; weightPct: number | null; grade: number | null }>) {
  const by = new Map<string, { sum: number; w: number }>();
  for (const r of rows) {
    if (r.grade == null) continue;
    const w = r.weightPct ?? 0;
    const cur = by.get(r.subject) ?? { sum: 0, w: 0 };
    // Sin peso: cuenta como 1 (media simple)
    cur.sum += r.grade * (w || 1);
    cur.w += w || 1;
    by.set(r.subject, cur);
  }
  return [...by].map(([subject, v]) => ({ subject, average: Math.round((v.sum / v.w) * 100) / 100, gradedPct: Math.min(100, rows.filter((r) => r.subject === subject && r.grade != null).reduce((a, r) => a + (r.weightPct ?? 0), 0)) }));
}

// 24 · Concentración por franja ------------------------------------------------------------------
export const SLOTS = [
  { key: "manana", label: "Mañana (6-12)", from: 6, to: 12 },
  { key: "mediodia", label: "Mediodía (12-15)", from: 12, to: 15 },
  { key: "tarde", label: "Tarde (15-20)", from: 15, to: 20 },
  { key: "noche", label: "Noche (20-6)", from: 20, to: 30 },
] as const;

/**
 * Las sesiones se guardan al terminar: el inicio es la hora de guardado menos los minutos. Minutos y
 * sesiones por franja (hora de Madrid) y por día de la semana; la franja con sesiones más largas.
 */
export function focusBySlot(rows: Array<{ createdAt: Date; minutes: number }>, timeZone = "Europe/Madrid") {
  const fmt = new Intl.DateTimeFormat("en-GB", { timeZone, hour: "2-digit", hourCycle: "h23", weekday: "short" });
  const WD = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  const slots = SLOTS.map((s) => ({ key: s.key, label: s.label, minutes: 0, sessions: 0, avg: 0 }));
  const week = Array.from({ length: 7 }, () => 0);
  for (const r of rows) {
    const start = new Date(r.createdAt.getTime() - r.minutes * 60_000);
    const parts = Object.fromEntries(fmt.formatToParts(start).map((p) => [p.type, p.value]));
    const h = Number(parts.hour);
    const hh = h < 6 ? h + 24 : h;
    const i = SLOTS.findIndex((s) => hh >= s.from && hh < s.to);
    slots[i].minutes += r.minutes;
    slots[i].sessions++;
    week[WD.indexOf(parts.weekday)] += r.minutes;
  }
  for (const s of slots) s.avg = s.sessions ? Math.round(s.minutes / s.sessions) : 0;
  const ranked = slots.filter((s) => s.sessions >= 3).sort((a, b) => b.avg - a.avg);
  return { slots, week, best: ranked[0] ?? null };
}
