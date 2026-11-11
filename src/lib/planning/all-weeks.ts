import { createHash } from "node:crypto";

import { rebaseBasis, setsOfRow } from "@/lib/training/prescription";

import type { PlanBlock, PlanRow } from "./plan-import/types";

/**
 * N7 · «Aplicar a todas las semanas». Lógica pura: qué cambió en una fila y cómo se traslada a las demás semanas.
 * Las series viajan como DIFERENCIA (la progresión semanal y la descarga se conservan); reps, RIR, descanso y carga como valor.
 */
export type RowInput = { exercise: string; sets: string; load: string; rir: string; rest: string; how: string };
export type RowChange = { setsDelta?: number; reps?: string; load?: string; rir?: string; rest?: string };

const SETS_PREFIX = /^\s*\d{1,2}\s*[×x]\s*/i;
const repsOfRow = (sets: string): string | null => (SETS_PREFIX.test(sets) ? sets.replace(SETS_PREFIX, "").trim() : null);

/** Qué cambió la usuaria en la fila respecto a lo guardado; null si nada que propagar. */
export function rowChange(before: Pick<PlanRow, "sets" | "load" | "rir" | "rest">, after: Pick<RowInput, "sets" | "load" | "rir" | "rest">): RowChange | null {
  const ch: RowChange = {};
  const b = setsOfRow(before.sets);
  const a = setsOfRow(after.sets);
  if (b !== null && a !== null && a !== b) ch.setsDelta = a - b;
  const rb = repsOfRow(before.sets);
  const ra = repsOfRow(after.sets);
  if (rb !== null && ra !== null && ra !== rb && ra) ch.reps = ra;
  if (after.load !== before.load) ch.load = after.load;
  if (after.rir !== before.rir) ch.rir = after.rir;
  if (after.rest !== before.rest) ch.rest = after.rest;
  return Object.keys(ch).length ? ch : null;
}

/** Fila resultante en otra semana. La justificación se reescribe con las series de ESA semana y las citas se conservan. */
export function applyChange(row: PlanRow, ch: RowChange): PlanRow {
  const out: PlanRow = { ...row };
  const n = setsOfRow(row.sets);
  let sets = n;
  if (ch.setsDelta !== undefined && n !== null) sets = Math.min(10, Math.max(1, n + ch.setsDelta));
  const reps = ch.reps ?? repsOfRow(row.sets);
  if (sets !== null && reps !== null && (sets !== n || ch.reps !== undefined)) out.sets = `${sets} × ${reps}`;
  if (ch.load !== undefined) out.load = ch.load;
  if (ch.rir !== undefined) out.rir = ch.rir;
  if (ch.rest !== undefined) out.rest = ch.rest;
  if (row.basis && sets !== null && sets !== n) out.basis = rebaseBasis(row.basis, sets);
  return out;
}

export type WeekDay = { id: string; week: number | null; date: Date | null; content: unknown; sessionId?: string | null };
export type AllWeeksItem = { dayId: string; week: number; date: string; exercise: string; before: string; after: string; content: PlanBlock[] };

const summary = (r: PlanRow) => [r.sets, r.load, r.rir && `RIR ${r.rir.replace(/^RIR\s*/i, "")}`, r.rest && `desc. ${r.rest}`].filter(Boolean).join(" · ");

/** Días de las demás semanas (mismo día de la semana, sin sesión hecha) con el cambio aplicado a las filas del mismo ejercicio. */
export function planAllWeeks(source: { id: string; date: Date | null }, days: WeekDay[], changes: Array<{ exercise: string; change: RowChange }>, doneSessions: ReadonlySet<string> = new Set()) {
  const items: AllWeeksItem[] = [];
  if (!source.date) return { items, fingerprint: fingerprint([]) };
  const wd = source.date.getUTCDay();
  const touched: WeekDay[] = [];
  for (const d of days) {
    if (d.id === source.id || !d.date || d.date.getUTCDay() !== wd) continue;
    if (d.sessionId && doneSessions.has(d.sessionId)) continue;
    const before = d.content as PlanBlock[];
    const rowsDone: AllWeeksItem[] = [];
    const content = before.map((b): PlanBlock => {
      if (b.kind !== "table") return b;
      return {
        kind: "table",
        rows: b.rows.map((r) => {
          const c = changes.find((x) => x.exercise === r.exercise);
          if (!c) return r;
          const next = applyChange(r, c.change);
          if (JSON.stringify(next) !== JSON.stringify(r)) rowsDone.push({ dayId: d.id, week: d.week ?? 0, date: d.date!.toISOString().slice(0, 10), exercise: r.exercise, before: summary(r), after: summary(next), content: [] });
          return next;
        }),
      };
    });
    if (!rowsDone.length) continue;
    touched.push(d);
    for (const it of rowsDone) items.push({ ...it, content });
  }
  items.sort((a, b) => a.date.localeCompare(b.date));
  return { items, fingerprint: fingerprint(touched) };
}

/** Huella del contenido actual de los días afectados: si cambia entre la vista previa y aceptar, se rechaza (409). */
export function fingerprint(days: Array<Pick<WeekDay, "id" | "content">>): string {
  const h = createHash("sha256");
  for (const d of [...days].sort((a, b) => a.id.localeCompare(b.id))) h.update(d.id).update(JSON.stringify(d.content));
  return h.digest("hex").slice(0, 32);
}
