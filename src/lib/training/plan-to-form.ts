import type { PlanBlock, PlanRow } from "@/lib/planning/plan-import/types";

import { findRm, isRmLoad, loadToKg, nameKey, parsePercents, type RmEntry, roundTo } from "./rm";

export type FormSet = { reps: number; weightKg: number; rpe: number | null; isWarmup: boolean };
export type PlannedBlock = { exercise: string; exerciseId: string | null; sets: FormSet[] };

/** «3 × 4» → [3, 4]; «1 × 6 y 1 × 6» → [[1,6],[1,6]]; «3 × (mi máximo − 2)» → reps null. */
export function parseSetsReps(text: string): Array<{ sets: number; reps: number | null }> {
  const out: Array<{ sets: number; reps: number | null }> = [];
  for (const part of text.split(/\s+y\s+/)) {
    const m = /(\d+)\s*×\s*(\d+)?/.exec(part);
    if (m) out.push({ sets: Number(m[1]), reps: m[2] ? Number(m[2]) : null });
  }
  return out;
}

/**
 * Del plan del día a series precargadas del formulario de fuerza: series ×
 * reps del plan y kg desde %RM. Las rampas van como series de calentamiento
 * del ejercicio siguiente. Solo filas con series numéricas y ejercicio del
 * catálogo; las demás se devuelven aparte para enlazarlas.
 */
export function planToBlocks(
  blocks: PlanBlock[],
  ctx: { rms: RmEntry[]; aliases: Map<string, string>; catalog: Map<string, string>; exerciseAliases: Map<string, string>; step: number },
): { blocks: PlannedBlock[]; unmatched: string[] } {
  const rows: PlanRow[] = blocks.flatMap((b) => (b.kind === "table" ? b.rows : []));
  const out: PlannedBlock[] = [];
  const unmatched = new Set<string>();
  let ramp: PlanRow | null = null;
  for (const row of rows) {
    if (row.ramp) {
      ramp = row;
      continue;
    }
    const groups = parseSetsReps(row.sets).filter((g) => g.reps != null);
    // Sin reps fijas (serie de test «al máximo», «mi máximo − 2»): no se precarga,
    // y su rampa pasa a la siguiente fila (el mismo ejercicio).
    if (!groups.length) continue;
    const key = nameKey(row.exercise);
    const exerciseId = ctx.exerciseAliases.get(key) ?? ctx.catalog.get(key) ?? null;
    if (!exerciseId) {
      unmatched.add(row.exercise.replace(/\s*·\s*SERIE DE TEST/, ""));
      ramp = null;
      continue;
    }
    const rm = findRm(row.exercise, ctx.rms, ctx.aliases);
    const pct = isRmLoad(row.load) ? parsePercents(row.load)[0] : undefined;
    const weight = rm && pct ? roundTo((rm.kg * pct) / 100, ctx.step) : 0;
    const sets: FormSet[] = [];
    if (ramp) {
      const rg = parseSetsReps(ramp.sets);
      const rp = isRmLoad(ramp.load) ? parsePercents(ramp.load) : [];
      rg.forEach((g, i) => {
        for (let k = 0; k < g.sets; k++) sets.push({ reps: g.reps ?? 5, weightKg: rm && rp[i] ? roundTo((rm.kg * rp[i]) / 100, ctx.step) : 0, rpe: null, isWarmup: true });
      });
      ramp = null;
    }
    for (const g of groups) for (let k = 0; k < g.sets; k++) sets.push({ reps: g.reps!, weightKg: weight, rpe: null, isWarmup: false });
    const prev = out.at(-1);
    // Serie de test + series normales del mismo ejercicio → un bloque.
    if (prev && prev.exerciseId === exerciseId) prev.sets.push(...sets);
    else out.push({ exercise: row.exercise, exerciseId, sets });
  }
  return { blocks: out, unmatched: [...unmatched] };
}

/** Añade a cada fila los kg desde %RM (las rampas usan la RM del ejercicio siguiente). */
export function annotateKg(blocks: PlanBlock[], rms: RmEntry[], aliases: Map<string, string>, step: number): PlanBlock[] {
  if (!rms.length) return blocks;
  return blocks.map((b) => {
    if (b.kind !== "table") return b;
    return {
      ...b,
      rows: b.rows.map((r, i) => {
        const target = r.ramp ? b.rows.slice(i + 1).find((x) => !x.ramp) : r;
        const kg = target ? loadToKg(r.load, findRm(target.exercise, rms, aliases), step) : null;
        return kg ? { ...r, kg } : r;
      }),
    };
  });
}
