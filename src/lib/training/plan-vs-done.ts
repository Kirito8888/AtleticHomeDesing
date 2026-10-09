import type { PlannedBlock } from "./plan-to-form";

/** Planificado frente a hecho por ejercicio (series efectivas, sin calentamiento). Puro. */
export type Side = { sets: number; reps: number; avgKg: number | null; tonnage: number };
export type PvdRow = { exercise: string; exerciseId: string | null; plan: Side | null; done: Side | null; tonnagePct: number | null };

function side(sets: Array<{ reps: number | null; weightKg: number | null; isWarmup: boolean }>): Side | null {
  const work = sets.filter((s) => !s.isWarmup && (s.reps ?? 0) > 0);
  if (!work.length) return null;
  const reps = work.reduce((a, s) => a + s.reps!, 0);
  const tonnage = work.reduce((a, s) => a + s.reps! * (s.weightKg ?? 0), 0);
  const loaded = work.filter((s) => (s.weightKg ?? 0) > 0);
  return {
    sets: work.length,
    reps,
    avgKg: loaded.length ? Math.round((loaded.reduce((a, s) => a + (s.weightKg ?? 0), 0) / loaded.length) * 10) / 10 : null,
    tonnage: Math.round(tonnage),
  };
}

export function planVsDone(planned: PlannedBlock[], done: Array<{ exerciseId: string; exercise: string; reps: number; weightKg: number; isWarmup: boolean }>): PvdRow[] {
  const rows: PvdRow[] = [];
  const doneBy = new Map<string, typeof done>();
  for (const d of done) doneBy.set(d.exerciseId, [...(doneBy.get(d.exerciseId) ?? []), d]);
  const seen = new Set<string>();
  for (const p of planned) {
    const ds = p.exerciseId ? doneBy.get(p.exerciseId) : undefined;
    if (p.exerciseId) seen.add(p.exerciseId);
    const plan = side(p.sets);
    const d = ds ? side(ds) : null;
    rows.push({ exercise: p.exercise, exerciseId: p.exerciseId, plan, done: d, tonnagePct: plan?.tonnage && d ? Math.round(((d.tonnage - plan.tonnage) / plan.tonnage) * 100) : null });
  }
  // Lo hecho que no estaba en el plan
  for (const [id, ds] of doneBy) {
    if (seen.has(id)) continue;
    rows.push({ exercise: ds[0].exercise, exerciseId: id, plan: null, done: side(ds), tonnagePct: null });
  }
  return rows;
}
