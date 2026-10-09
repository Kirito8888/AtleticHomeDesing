import { describe, expect, it } from "vitest";

import { deadlineState, tripSchema, tripStatus } from "./trips";

describe("viajes de competición", () => {
  it("presupuesto por partidas frente a gastado y reembolso pendiente", () => {
    const t = { budget: { transport: 4000, lodging: 6000, entry: 1000 }, reimbursableCents: 5000, reimbursedAt: null };
    expect(tripStatus(t, 12500)).toMatchObject({ budgetCents: 11000, spentCents: 12500, leftCents: -1500, over: true, pendingCents: 5000, netCents: 7500 });
    expect(tripStatus({ ...t, reimbursedAt: "2026-10-01" }, 0)).toMatchObject({ pendingCents: 0, over: false });
  });

  it("la vuelta no puede ser antes de la ida", () => {
    expect(tripSchema.safeParse({ name: "Autonómico", startsOn: "2026-10-10", endsOn: "2026-10-09" }).success).toBe(false);
    expect(tripSchema.parse({ name: "Autonómico", startsOn: "2026-10-10" }).budget.transport).toBe(0);
  });
});

describe("plazos", () => {
  it("avisa desde N días antes hasta el día, no si está hecho, y marca vencidos", () => {
    const d = { dueOn: "2026-10-12", remindDays: 3, done: false };
    expect(deadlineState(d, "2026-10-08")).toEqual({ daysLeft: 4, overdue: false, remindNow: false });
    expect(deadlineState(d, "2026-10-09").remindNow).toBe(true);
    expect(deadlineState(d, "2026-10-12").remindNow).toBe(true);
    expect(deadlineState(d, "2026-10-13")).toEqual({ daysLeft: -1, overdue: true, remindNow: false });
    expect(deadlineState({ ...d, done: true }, "2026-10-10").remindNow).toBe(false);
  });
});
