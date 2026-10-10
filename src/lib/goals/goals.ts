import { z } from "zod";

import { isoDate } from "@/lib/dates";
import { formatEur } from "@/lib/format";

export const GOAL_KINDS = ["MARK", "TEST", "HABIT", "BUDGET", "CUSTOM"] as const;
export type GoalKindKey = (typeof GOAL_KINDS)[number];

export const GOAL_KIND_LABEL: Record<GoalKindKey, string> = {
  MARK: "Marca",
  TEST: "Test físico",
  HABIT: "Racha de un hábito",
  BUDGET: "Gasto del mes",
  CUSTOM: "Otro (a mano)",
};

export const goalSchema = z
  .object({
    kind: z.enum(GOAL_KINDS),
    title: z.string().trim().min(1).max(80),
    target: z.number().positive().max(1e7),
    current: z.number().min(0).max(1e7).nullish(),
    unit: z.string().trim().max(12).nullish(),
    higherIsBetter: z.boolean().default(true),
    linkRef: z.string().trim().max(80).nullish(),
    dueOn: isoDate.nullish(),
  })
  .refine((g) => g.kind === "CUSTOM" || Boolean(g.linkRef), { message: "Elige a qué está ligado el objetivo", path: ["linkRef"] });
export type GoalInput = z.infer<typeof goalSchema>;

export const goalPatchSchema = z.object({ current: z.number().min(0).max(1e7).nullish(), done: z.boolean().optional() });

export type GoalProgress = { current: number | null; pct: number; reached: boolean };

/**
 * Progreso hacia el objetivo (0–1). Más es mejor: actual/objetivo. Menos es mejor (tiempos):
 * objetivo/actual. Gasto del mes: «reached» mientras no se pase y pct es lo gastado.
 */
export function goalProgress(g: { kind: GoalKindKey; target: number; higherIsBetter: boolean }, current: number | null): GoalProgress {
  if (current == null) return { current: null, pct: 0, reached: false };
  const clamp = (x: number) => Math.max(0, Math.min(1, x));
  if (g.kind === "BUDGET") return { current, pct: clamp(current / g.target), reached: current <= g.target };
  if (g.higherIsBetter) return { current, pct: clamp(current / g.target), reached: current >= g.target };
  return { current, pct: current > 0 ? clamp(g.target / current) : 0, reached: current > 0 && current <= g.target };
}

/** Valor con su unidad (los gastos van en céntimos). */
export function goalValue(kind: GoalKindKey, v: number | null, unit: string | null) {
  if (v == null) return "—";
  if (kind === "BUDGET") return formatEur(v);
  if (kind === "HABIT") return `${v} ${v === 1 ? "día" : "días"}`;
  return `${Number.isInteger(v) ? v : v.toFixed(2)}${unit ? ` ${unit}` : ""}`;
}
