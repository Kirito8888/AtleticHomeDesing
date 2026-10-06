import type { PlanBlock } from "@/lib/planning/plan-import/types";

/** Qué se muestra de un día del plan (versión normal o suave) y qué ejercicios se pueden cambiar. */
export function dayView(d: { content: unknown; light: unknown; mode: string | null }) {
  const light = d.light as { durationMin: number; blocks: PlanBlock[] } | null;
  const content = d.content as PlanBlock[];
  const blocks = d.mode === "LIGHT" && light ? light.blocks : content;
  const swappable = content.flatMap((b, bi) =>
    b.kind === "table"
      ? b.rows.flatMap((r, ri) => (r.alternatives?.length ? [{ block: bi, row: ri, exercise: r.exercise, alternatives: r.alternatives.map((a) => a.name) }] : []))
      : [],
  );
  return { blocks, hasLight: Boolean(light), swappable, isLight: d.mode === "LIGHT" && Boolean(light) };
}
