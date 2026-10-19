import { createHash } from "node:crypto";

import type { PlanBlock } from "@/lib/planning/plan-import/types";

import { adjustBlocks, type Rating } from "./adjust";

/** Umbral de dolor a partir del cual la semana siguiente pasa a la versión suave. */
export const PAIN_LIGHT_THRESHOLD = 4;

export type FeedbackDay = {
  id: string;
  code: string;
  title: string;
  date: Date | null;
  content: unknown;
  mode: string | null;
  light: unknown;
  sessionId: string | null;
  updatedAt: Date;
};

export type DayChange = {
  dayId: string;
  code: string;
  title: string;
  date: string | null;
  toLight: boolean;
  rows: Array<{ exercise: string; before: string; after: string }>;
  content: PlanBlock[];
  mode: string | null;
};

export type WeekProposal = { version: string; days: DayChange[] };

/** Huella del estado de la semana: si cambia algo entre vista previa y aplicar, deja de coincidir. */
export function weekVersion(days: FeedbackDay[], doneSessionIds: Set<string>): string {
  const h = createHash("sha256");
  for (const d of [...days].sort((a, b) => a.id.localeCompare(b.id))) {
    h.update(`${d.id}|${d.updatedAt.toISOString()}|${d.mode ?? ""}|${d.sessionId && doneSessionIds.has(d.sessionId) ? "done" : ""};`);
  }
  return h.digest("hex").slice(0, 16);
}

/** Qué cambiaría en cada día pendiente de la semana siguiente. No escribe ni muta nada. */
export function proposeWeekChanges(days: FeedbackDay[], doneSessionIds: Set<string>, rating: Rating, pain: number | null): WeekProposal {
  const out: DayChange[] = [];
  for (const d of days) {
    if (d.sessionId && doneSessionIds.has(d.sessionId)) continue;
    const before = d.content as PlanBlock[];
    const { blocks, changed } = adjustBlocks(before, rating);
    const mode = pain != null && pain >= PAIN_LIGHT_THRESHOLD && d.light ? "LIGHT" : d.mode;
    const toLight = mode === "LIGHT" && d.mode !== "LIGHT";
    if (!changed && mode === d.mode) continue;
    const rows: DayChange["rows"] = [];
    blocks.forEach((b, bi) => {
      const old = before[bi];
      if (b.kind !== "table" || old?.kind !== "table") return;
      b.rows.forEach((r, ri) => {
        const o = old.rows[ri];
        if (o && o.sets !== r.sets) rows.push({ exercise: r.exercise, before: o.sets, after: r.sets });
      });
    });
    out.push({ dayId: d.id, code: d.code, title: d.title, date: d.date ? d.date.toISOString().slice(0, 10) : null, toLight, rows, content: blocks, mode });
  }
  return { version: weekVersion(days, doneSessionIds), days: out };
}
