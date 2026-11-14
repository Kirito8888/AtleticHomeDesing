/**
 * v3.0 D (V3-S01) · 2FA obligatoria para ADMIN y COACH, con periodo de gracia por fecha de corte
 * (`STAFF_2FA_REQUIRED_FROM`, AAAA-MM-DD, sin esquema). Lógica pura: sin BD ni entorno.
 * - Sin segundo factor y sin fecha de corte → solo aviso (`grace` sin fecha): no deja fuera a nadie al desplegar.
 * - Con fecha futura → `grace` con los días que quedan. Con fecha pasada (o hoy) → `blocked`.
 */
export type StaffSecondFactorState = { kind: "ok" } | { kind: "grace"; daysLeft: number | null; from: string | null } | { kind: "blocked" };

const DAY = 864e5;

export function staffSecondFactorState(i: { role: string; hasFactor: boolean; requiredFrom?: string | null; now?: Date }): StaffSecondFactorState {
  if ((i.role !== "ADMIN" && i.role !== "COACH") || i.hasFactor) return { kind: "ok" };
  const from = i.requiredFrom ?? null;
  if (!from) return { kind: "grace", daysLeft: null, from: null };
  const now = i.now ?? new Date();
  const cutoff = Date.parse(`${from}T00:00:00Z`);
  if (Number.isNaN(cutoff)) return { kind: "grace", daysLeft: null, from: null };
  if (now.getTime() >= cutoff) return { kind: "blocked" };
  return { kind: "grace", daysLeft: Math.ceil((cutoff - now.getTime()) / DAY), from };
}
