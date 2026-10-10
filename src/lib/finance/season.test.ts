import { describe, expect, it } from "vitest";

import { priceAlerts, seasonForecast } from "./season";

describe("finanzas v1.7", () => {
  it("previsión de la temporada: la mayor entre ritmo actual y calendario de competiciones", () => {
    const base = { lines: { license: 120_00, gear: 300_00, travel: 600_00 }, perCompetitionCents: 80_00, incomeCents: 900_00, season: 2026 };
    // 1 de julio (día 182): 500 € gastados → ritmo ≈ 1003 €; calendario: 500 + 4×80 = 820 €
    const f = seasonForecast({ ...base, spentCents: 500_00, upcomingCompetitions: 4, today: "2026-07-01" });
    expect(f.plannedCents).toBe(1020_00);
    expect(f.linearCents).toBe(Math.round((500_00 * 365) / 182));
    expect(f.calendarCents).toBe(820_00);
    expect(f.forecastCents).toBe(f.linearCents);
    expect(f.usedPct).toBe(49);
    expect(f.balanceCents).toBe(900_00 - f.forecastCents);
    // Con muchas competiciones por delante manda el calendario; sin 30 días de datos no hay ritmo
    const g = seasonForecast({ ...base, spentCents: 100_00, upcomingCompetitions: 12, today: "2026-01-20" });
    expect(g.linearCents).toBeNull();
    expect(g.forecastCents).toBe(100_00 + 12 * 80_00);
    expect(g.overBudgetCents).toBe(1060_00 - 1020_00);
    // Temporada pasada: lo gastado
    expect(seasonForecast({ ...base, season: 2025, spentCents: 700_00, upcomingCompetitions: 3, today: "2026-03-01" }).forecastCents).toBe(700_00);
  });

  it("avisa si el último cargo supera el precio guardado (por id o por nombre)", () => {
    const subs = [
      { id: "s1", name: "Música Premium", amountCents: 999, isActive: true },
      { id: "s2", name: "Gimnasio", amountCents: 3500, isActive: true },
      { id: "s3", name: "Nube", amountCents: 299, isActive: false },
    ];
    const charges = [
      { id: "c1", subscriptionId: null, description: "PAGO MUSICA PREMIUM SL", payee: null, date: "2026-10-01", amountCents: 1199 },
      { id: "c2", subscriptionId: null, description: "Musica premium", payee: null, date: "2026-09-01", amountCents: 999 },
      { id: "c3", subscriptionId: "s2", description: "Cuota", payee: null, date: "2026-10-02", amountCents: 3500 },
      { id: "c4", subscriptionId: null, description: "nube", payee: null, date: "2026-10-03", amountCents: 499 },
      { id: "c5", subscriptionId: "s2", description: "Cuota", payee: null, date: "2026-06-01", amountCents: 9999 },
    ];
    expect(priceAlerts(subs, charges, "2026-10-10")).toEqual([{ subscriptionId: "s1", name: "Música Premium", storedCents: 999, chargedCents: 1199, date: "2026-10-01", pct: 20 }]);
  });
});
