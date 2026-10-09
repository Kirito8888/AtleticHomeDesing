// Inventario de material: uso, vida útil y aviso de reposición. Puro (sin BD).
import { z } from "zod";

import { isoDate } from "@/lib/dates";
import type { Alert } from "@/lib/rules/engine";

export const EQUIPMENT_KINDS = {
  JAVELIN: { label: "Jabalina", unit: "lanzamientos" },
  SPIKES: { label: "Zapatillas de clavos", unit: "sesiones de pista o técnica" },
  SHOES: { label: "Zapatillas", unit: "sesiones" },
  OTHER: { label: "Otro", unit: "usos" },
} as const;
export type EquipmentKind = keyof typeof EQUIPMENT_KINDS;

export const equipmentSchema = z.object({
  name: z.string().trim().min(1).max(80),
  kind: z.enum(["JAVELIN", "SPIKES", "SHOES", "OTHER"]),
  implementWeightG: z.number().int().min(100).max(10000).nullish(),
  purchasedOn: isoDate.nullish(),
  lifeUses: z.number().int().min(1).max(100000).nullish(),
  lifeMonths: z.number().int().min(1).max(240).nullish(),
  transactionId: z.string().max(40).nullish(),
  notes: z.string().trim().max(500).nullish(),
});
export const equipmentPatchSchema = z.object({
  addUses: z.number().int().min(-1000).max(1000),
  retired: z.boolean(),
  notes: z.string().trim().max(500).nullable(),
  lifeUses: z.number().int().min(1).max(100000).nullable(),
  lifeMonths: z.number().int().min(1).max(240).nullable(),
}).partial();

/** Meses (con decimales) entre dos fechas ISO. */
export function monthsBetween(from: string, to: string): number {
  return Math.max(0, (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / (30.44 * 86_400_000));
}

export interface EquipmentState {
  uses: number;
  usesPct: number | null;
  months: number | null;
  monthsPct: number | null;
  /** El mayor de los dos porcentajes de vida consumida */
  wearPct: number | null;
  level: "ok" | "soon" | "replace";
}

/** Desgaste: el peor entre usos y meses frente a la vida útil indicada. ≥ 80 % avisa; ≥ 100 %, reponer. */
export function equipmentState(item: { purchasedOn: string | null; lifeUses: number | null; lifeMonths: number | null }, uses: number, today: string): EquipmentState {
  const months = item.purchasedOn ? monthsBetween(item.purchasedOn, today) : null;
  const usesPct = item.lifeUses ? Math.round((uses / item.lifeUses) * 100) : null;
  const monthsPct = item.lifeMonths && months != null ? Math.round((months / item.lifeMonths) * 100) : null;
  const pcts = [usesPct, monthsPct].filter((x): x is number => x != null);
  const wearPct = pcts.length ? Math.max(...pcts) : null;
  return { uses, usesPct, months: months != null ? Math.round(months * 10) / 10 : null, monthsPct, wearPct, level: wearPct == null ? "ok" : wearPct >= 100 ? "replace" : wearPct >= 80 ? "soon" : "ok" };
}

export function equipmentAlerts(items: Array<{ id: string; name: string; retired: boolean; state: EquipmentState }>): Alert[] {
  return items
    .filter((i) => !i.retired && i.state.level !== "ok")
    .map((i) => ({
      id: `equip-${i.id}`,
      level: i.state.level === "replace" ? "warn" : "info",
      title: i.state.level === "replace" ? `Toca reponer: ${i.name}` : `${i.name} al ${i.state.wearPct} % de su vida útil`,
      message:
        i.state.level === "replace"
          ? "Ha superado la vida útil que le pusiste. Revísalo y, si está gastado, cámbialo antes de que te haga perder agarre o te lesione."
          : "Ve pensando en la siguiente compra (y en meterla en el presupuesto de la temporada).",
    }));
}
