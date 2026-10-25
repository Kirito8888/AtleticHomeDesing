// v2.5 · Estudio B15 · Ruta de estudio de una asignatura: días que quedan y orden por prioridad. Puro (sin BD).
import { z } from "zod";

import { dateOnly, diffDays } from "@/lib/dates";

import { type Tag, WEIGHT } from "./adhd-report";

export const moduleSchema = z.object({
  name: z.string().trim().min(1).max(80),
  examDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  prepMode: z.boolean().optional(),
});
export const topicSchema = z.object({
  name: z.string().trim().min(1).max(120),
  tag: z.enum(["red", "yellow", "grey"]).default("yellow"),
  minutes: z.coerce.number().int().min(5).max(600).default(30),
});

export type RouteTopic = { id: string; name: string; tag: Tag; minutes: number; done: boolean };
export type RouteItem = RouteTopic & {
  /** Posición en la ruta (1 = lo primero que hay que estudiar). */
  order: number;
  /** Día sugerido (1…n) contando `dailyMin` por día; null si ya está hecho. */
  day: number | null;
  /** No cabe antes del examen con el tiempo disponible: sigue en la lista, pero al final. */
  overflow: boolean;
};

/** Días naturales hasta el examen (0 = hoy, negativo = ya pasó); null sin fecha. */
export function daysLeft(today: string, examDate: string | null | undefined): number | null {
  if (!examDate) return null;
  return diffDays(dateOnly(examDate), dateOnly(today));
}

/**
 * Ordena TODO el temario (no quita nada). Pendientes primero, hechos al final.
 * - Si el temario pendiente cabe en `max(1, días) × dailyMin`: por nivel 🔴→🟡→⚪ y, dentro de cada
 *   nivel, más nota por minuto antes (peso ÷ minutos).
 * - Si no cabe: voraz por nota/minuto (peso ÷ minutos; a igualdad, el nivel más alto) y lo que
 *   rebasa la capacidad se marca `overflow`.
 * Sin fecha no hay límite de tiempo. El orden original desempata (estable).
 */
export function prioritize(o: { topics: RouteTopic[]; daysLeft: number | null; dailyMin: number }): RouteItem[] {
  const daily = Math.max(1, o.dailyMin);
  const score = (t: RouteTopic) => WEIGHT[t.tag] / Math.max(1, t.minutes);
  const idx = new Map(o.topics.map((t, i) => [t.id, i]));
  const pending = o.topics.filter((t) => !t.done);
  const total = pending.reduce((a, t) => a + t.minutes, 0);
  const capacity = o.daysLeft === null ? Infinity : Math.max(1, o.daysLeft) * daily;
  const fits = total <= capacity;
  const byTag = (a: RouteTopic, b: RouteTopic) => WEIGHT[b.tag] - WEIGHT[a.tag];
  const byScore = (a: RouteTopic, b: RouteTopic) => score(b) - score(a);
  const stable = (a: RouteTopic, b: RouteTopic) => idx.get(a.id)! - idx.get(b.id)!;
  const sorted = [...pending].sort(fits ? (a, b) => byTag(a, b) || byScore(a, b) || stable(a, b) : (a, b) => byScore(a, b) || byTag(a, b) || stable(a, b));
  let acc = 0;
  const out: RouteItem[] = sorted.map((t, i) => {
    acc += t.minutes;
    return { ...t, order: i + 1, day: Math.ceil(acc / daily), overflow: acc > capacity };
  });
  for (const t of o.topics.filter((x) => x.done)) out.push({ ...t, order: 0, day: null, overflow: false });
  return out.map((t, i) => ({ ...t, order: i + 1 }));
}
