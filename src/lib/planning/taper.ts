// Afinamiento antes de una competición A (v1.6). Puro.
// No toca el contenido del día del plan: se guarda solo el % (PlanDay.taperPct) y se aplica al mostrarlo.
import type { PlanBlock } from "./plan-import/types";
import { parseSetsReps } from "@/lib/training/plan-to-form";

/** «3 × 5» con −30 % → «2 × 5»; «1 × 6 y 1 × 6» → «1 × 6 y 1 × 6» (nunca baja de 1 serie). */
export function taperSets(text: string, pct: number): string {
  const groups = parseSetsReps(text);
  if (!groups.length) return text;
  const out = groups.map((g) => `${Math.max(1, Math.round(g.sets * (1 - pct / 100)))} × ${g.reps ?? "?"}`).join(" y ");
  return out === groups.map((g) => `${g.sets} × ${g.reps ?? "?"}`).join(" y ") ? text : out;
}

/** Bloques del día con las series recortadas (las rampas no se tocan). */
export function taperBlocks(blocks: PlanBlock[], pct: number): PlanBlock[] {
  if (!pct) return blocks;
  return blocks.map((b) =>
    b.kind === "table"
      ? { ...b, rows: b.rows.map((r) => (r.ramp ? r : { ...r, sets: taperSets(r.sets, pct), how: r.sets === taperSets(r.sets, pct) ? r.how : `${r.how ? `${r.how} · ` : ""}Plan original: ${r.sets}` })) }
      : b,
  );
}

/** Días pendientes del plan entre `days` días antes de la competición y la víspera. */
export function taperDays<T extends { date: string | null; done: boolean }>(days: T[], competition: string, n: number): T[] {
  const from = new Date(Date.parse(`${competition}T00:00:00Z`) - n * 864e5).toISOString().slice(0, 10);
  return days.filter((d) => d.date && d.date >= from && d.date < competition && !d.done);
}
