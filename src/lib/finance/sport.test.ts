import { describe, expect, it } from "vitest";

import { sportReport } from "./sport";

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
