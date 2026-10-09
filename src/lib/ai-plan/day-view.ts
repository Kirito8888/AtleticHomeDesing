import type { PlanBlock } from "@/lib/planning/plan-import/types";
import { taperBlocks } from "@/lib/planning/taper";

/** Qué se muestra de un día del plan (versión normal o suave) y qué ejercicios se pueden cambiar. */
export function dayView(d: { content: unknown; light: unknown; mode: string | null; taperPct?: number | null }) {
  const light = d.light as { durationMin: number; blocks: PlanBlock[] } | null;
  const content = d.content as PlanBlock[];
  // v1.6: el afinamiento se aplica al mostrarlo; el contenido guardado no cambia
  const blocks = taperBlocks(d.mode === "LIGHT" && light ? light.blocks : content, d.taperPct ?? 0);
  const swappable = content.flatMap((b, bi) =>
    b.kind === "table"
      ? b.rows.flatMap((r, ri) => (r.alternatives?.length ? [{ block: bi, row: ri, exercise: r.exercise, alternatives: r.alternatives.map((a) => a.name) }] : []))
      : [],
  );
  return { blocks, hasLight: Boolean(light), swappable, isLight: d.mode === "LIGHT" && Boolean(light), taperPct: d.taperPct ?? null };
}
