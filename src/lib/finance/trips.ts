// v1.6 · Viajes de competición (presupuesto por partidas y reembolso) y plazos con aviso. Puro (sin BD).
import { z } from "zod";

import { isoDate } from "@/lib/dates";

export const TRIP_PARTS = { transport: "Transporte", lodging: "Alojamiento", entry: "Inscripción", food: "Comida", other: "Otros" } as const;
export type TripPart = keyof typeof TRIP_PARTS;

const euros = z.number().int().min(0).max(10_000_000);
export const tripBudgetSchema = z.object({ transport: euros.default(0), lodging: euros.default(0), entry: euros.default(0), food: euros.default(0), other: euros.default(0) });

export const tripSchema = z
  .object({
    name: z.string().trim().min(1).max(80),
    eventId: z.string().max(40).nullish(),
    startsOn: isoDate,
    endsOn: isoDate.nullish(),
    /** En céntimos. */
    budget: tripBudgetSchema.default({ transport: 0, lodging: 0, entry: 0, food: 0, other: 0 }),
    reimbursableCents: euros.default(0),
  })
  .refine((t) => !t.endsOn || t.endsOn >= t.startsOn, { message: "La vuelta no puede ser antes de la ida", path: ["endsOn"] });

/** Presupuesto frente a gastado y lo que te debe la federación. */
export function tripStatus(t: { budget: unknown; reimbursableCents: number; reimbursedAt: Date | string | null }, spentCents: number) {
  const b = tripBudgetSchema.safeParse(t.budget ?? {});
  const budget = b.success ? b.data : tripBudgetSchema.parse({});
  const budgetCents = Object.values(budget).reduce((a, x) => a + x, 0);
  const pendingCents = t.reimbursedAt ? 0 : t.reimbursableCents;
  return {
    budget,
    budgetCents,
    spentCents,
    leftCents: budgetCents - spentCents,
    over: budgetCents > 0 && spentCents > budgetCents,
    pendingCents,
    /** Lo que te cuesta de verdad el viaje (gastado menos lo que te devuelven). */
    netCents: spentCents - t.reimbursableCents,
  };
}

// ---------- 26 · Plazos ----------
export const DEADLINE_KIND = { ENTRY: "Inscripción", LICENSE: "Licencia", GRANT: "Beca", OTHER: "Otro" } as const;
export const deadlineSchema = z.object({
  title: z.string().trim().min(1).max(120),
  kind: z.enum(["ENTRY", "LICENSE", "GRANT", "OTHER"]).default("OTHER"),
  dueOn: isoDate,
  remindDays: z.number().int().min(0).max(60).default(3),
  done: z.boolean().default(false),
});

const daysBetween = (a: string, b: string) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 864e5);

/** Días que faltan (negativo si ya pasó) y si toca avisar hoy (desde N días antes hasta el día, si no está hecho). */
export function deadlineState(d: { dueOn: string; remindDays: number; done: boolean }, today: string) {
  const daysLeft = daysBetween(today, d.dueOn);
  return { daysLeft, overdue: !d.done && daysLeft < 0, remindNow: !d.done && daysLeft >= 0 && daysLeft <= d.remindDays };
}
