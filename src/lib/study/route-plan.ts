// v2.9 · N4 · Ruta priorizada de una asignatura → bloques de estudio por día (borrador). Puro (sin BD).
import { z } from "zod";

import { addDays, dateOnly, toIsoDay } from "@/lib/dates";

import type { RouteItem } from "./study-route";

/** Días que se planifican cuando la asignatura no tiene fecha de examen. */
export const ROUTE_HORIZON_DAYS = 28;

export type RouteBlock = { topicId: string; topic: string; date: string; minutes: number };
export type RouteLeftover = { topicId: string; topic: string; minutes: number };

/**
 * Días en los que se puede estudiar: de hoy a la víspera del examen; sin fecha, `horizonDays` días
 * desde hoy (tope: un año). Con el examen hoy o ya pasado no queda ninguno.
 */
export function planDays(today: string, examDate: string | null, horizonDays = ROUTE_HORIZON_DAYS): string[] {
  const out: string[] = [];
  const start = dateOnly(today);
  for (let i = 0; i < 366; i++) {
    const day = toIsoDay(addDays(start, i));
    if (examDate ? day >= examDate : i >= horizonDays) break;
    out.push(day);
  }
  return out;
}

/**
 * Vuelca la ruta (ya ordenada por `prioritize`, que no se toca) en bloques por día, en el mismo orden:
 * cada tema pendiente ocupa el hueco libre de los días siguientes y, si no cabe en uno, se parte en
 * tramos de al menos `blockMin` (salvo el último resto). El avance es solo hacia delante, así que el
 * orden de la ruta se respeta en el calendario. Lo que no cabe va a `unscheduled`: se dice, no se esconde.
 *
 * @param o.route Salida de `prioritize` (los hechos se ignoran).
 * @param o.days Días disponibles en orden (`planDays`).
 * @param o.capacity Minutos libres de cada día (ya descontado lo que hay ese día).
 * @param o.blockMin Tramo mínimo en minutos (pref. `studyBlockMin`).
 */
export function routeToBlocks(o: {
  route: Pick<RouteItem, "id" | "name" | "minutes" | "done" | "order">[];
  days: string[];
  capacity: (day: string) => number;
  blockMin: number;
}): { blocks: RouteBlock[]; unscheduled: RouteLeftover[] } {
  const minBlock = Math.max(1, o.blockMin);
  const free = o.days.map((d) => Math.max(0, Math.floor(o.capacity(d))));
  const blocks: RouteBlock[] = [];
  const unscheduled: RouteLeftover[] = [];
  let i = 0;
  const pending = o.route.filter((t) => !t.done).sort((a, b) => a.order - b.order);
  for (const t of pending) {
    let left = Math.max(0, t.minutes);
    while (left > 0 && i < o.days.length) {
      if (free[i] < Math.min(minBlock, left)) {
        i++;
        continue;
      }
      const give = Math.min(free[i], left);
      free[i] -= give;
      left -= give;
      blocks.push({ topicId: t.id, topic: t.name, date: o.days[i], minutes: give });
      if (free[i] < minBlock) i++;
    }
    if (left > 0) unscheduled.push({ topicId: t.id, topic: t.name, minutes: left });
  }
  return { blocks, unscheduled };
}

/** Lo que manda la pantalla al aceptar el borrador (ya revisado y, quizá, retocado). */
export const acceptRoutePlanSchema = z.object({
  blocks: z
    .array(
      z.object({
        topicId: z.string().min(1).max(64),
        date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        minutes: z.coerce.number().int().min(5).max(600),
      }),
    )
    .min(1)
    .max(200),
});
export type AcceptRoutePlanInput = z.infer<typeof acceptRoutePlanSchema>;
