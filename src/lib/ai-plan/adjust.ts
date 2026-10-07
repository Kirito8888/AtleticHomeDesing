import type { PlanBlock, PlanRow } from "@/lib/planning/plan-import/types";

export type Rating = "EASY" | "OK" | "HARD";

const SETS_RE = /^(\d+)(\s*×.*)$/;

/**
 * Ajuste local de la semana siguiente según cómo fue la anterior (sin IA):
 * «demasiado duro» quita una serie a cada ejercicio (mínimo 1), «demasiado
 * fácil» añade una (máximo 8). Las rampas no se tocan.
 */
export function adjustBlocks(blocks: PlanBlock[], rating: Rating): { blocks: PlanBlock[]; changed: boolean } {
  if (rating === "OK") return { blocks, changed: false };
  let changed = false;
  const out = blocks.map((b) => {
    if (b.kind !== "table") return b;
    return {
      ...b,
      rows: b.rows.map((r) => {
        const m = SETS_RE.exec(r.sets);
        if (!m || r.ramp) return r;
        const n = Number(m[1]);
        const next = rating === "HARD" ? Math.max(1, n - 1) : Math.min(8, n + 1);
        if (next === n) return r;
        changed = true;
        return { ...r, sets: `${next}${m[2]}` };
      }),
    };
  });
  return { blocks: out, changed };
}

/**
 * Cambia los ejercicios que no se pueden hacer con el material disponible por
 * su primera alternativa compatible. Devuelve los que no tienen alternativa
 * (para pedírselos a la IA) con su posición.
 */
export function swapForEquipment(blocks: PlanBlock[], allowed: Set<string>): { blocks: PlanBlock[]; unresolved: Array<{ block: number; row: number; item: PlanRow }>; swapped: number } {
  const unresolved: Array<{ block: number; row: number; item: PlanRow }> = [];
  let swapped = 0;
  const fits = (eq: string[] | undefined) => !eq || eq.every((e) => allowed.has(e));
  // Ejercicios que ya hay ese día (los que se quedan): no repetir uno como alternativa.
  const used = new Set(blocks.flatMap((b) => (b.kind === "table" ? b.rows.filter((r) => fits(r.equipment)).map((r) => r.exercise) : [])));
  const out = blocks.map((b, bi) => {
    if (b.kind !== "table") return b;
    return {
      ...b,
      rows: b.rows.map((r, ri) => {
        if (fits(r.equipment)) return r;
        const alt = r.alternatives?.find((a) => fits(a.equipment) && !used.has(a.name));
        if (alt) used.add(alt.name);
        if (!alt) {
          unresolved.push({ block: bi, row: ri, item: r });
          return r;
        }
        swapped++;
        return {
          ...r,
          exercise: alt.name,
          equipment: alt.equipment,
          original: r.original ?? r.exercise,
          alternatives: [{ name: r.exercise, equipment: r.equipment ?? [] }, ...(r.alternatives ?? []).filter((a) => a !== alt)].slice(0, 3),
        };
      }),
    };
  });
  return { blocks: out, unresolved, swapped };
}

/** Elige una alternativa concreta de una fila (el usuario la escoge del desplegable). */
export function chooseAlternative(blocks: PlanBlock[], blockIdx: number, rowIdx: number, altIdx: number): PlanBlock[] {
  return blocks.map((b, bi) => {
    if (bi !== blockIdx || b.kind !== "table") return b;
    return {
      ...b,
      rows: b.rows.map((r, ri) => {
        if (ri !== rowIdx) return r;
        const alt = r.alternatives?.[altIdx];
        if (!alt) return r;
        return {
          ...r,
          exercise: alt.name,
          equipment: alt.equipment,
          original: r.original ?? r.exercise,
          alternatives: [{ name: r.exercise, equipment: r.equipment ?? [] }, ...(r.alternatives ?? []).filter((_, i) => i !== altIdx)].slice(0, 3),
        };
      }),
    };
  });
}
