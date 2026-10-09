import { describe, expect, it } from "vitest";

import { sportBalance, sportReport } from "./sport";

describe("gastos deportivos", () => {
  it("por temporada (año) y por competición, la más reciente primero", () => {
    const r = sportReport([
      { date: "2026-03-01", amountCents: 3000, eventId: null, eventTitle: null },
      { date: "2026-06-10", amountCents: 4500, eventId: "e1", eventTitle: "Autonómico" },
      { date: "2026-06-11", amountCents: 1500, eventId: "e1", eventTitle: "Autonómico" },
      { date: "2025-12-20", amountCents: 9000, eventId: null, eventTitle: null },
    ]);
    expect(r.map((s) => [s.season, s.totalCents, s.count])).toEqual([
      ["2026", 9000, 3],
      ["2025", 9000, 1],
    ]);
    expect(r[0].byEvent.map((e) => [e.title, e.totalCents])).toEqual([
      ["Autonómico", 6000],
      ["Sin competición (material, licencias…)", 3000],
    ]);
  });
});

describe("temporada deportiva: ingresos frente a gastos", () => {
  it("saldo por temporada y previsión de gasto de la temporada en curso", () => {
    const r = sportBalance(
      [
        { date: "2026-01-15", amountCents: 100000, kind: "INCOME" },
        { date: "2026-02-01", amountCents: 20000, kind: "EXPENSE" },
        { date: "2026-03-01", amountCents: 16500, kind: "EXPENSE" },
        { date: "2025-06-01", amountCents: 5000, kind: "EXPENSE" },
      ],
      "2026-07-02", // día 183 de 365
    );
    expect(r[0]).toMatchObject({ season: "2026", incomeCents: 100000, expenseCents: 36500, balanceCents: 63500 });
    expect(r[0].forecast).toEqual({ expenseCents: Math.round((36500 * 365) / 183), balanceCents: 100000 - Math.round((36500 * 365) / 183) });
    expect(r[1]).toMatchObject({ season: "2025", balanceCents: -5000, forecast: null });
  });

  it("sin previsión con menos de un mes de temporada", () => {
    expect(sportBalance([{ date: "2026-01-02", amountCents: 100, kind: "EXPENSE" }], "2026-01-10")[0].forecast).toBeNull();
  });
});
