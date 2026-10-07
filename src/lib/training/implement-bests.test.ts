import { describe, expect, it } from "vitest";

import { implementBests, type MarkRow } from "./implement-bests";

// Marcas inventadas.
const m = (date: string, markM: number, g: number | null = 800, event = "JAVELIN", isCompetition = false): MarkRow => ({ date, event, implementWeightG: g, markM, isCompetition });

describe("los 3 mejores por implemento", () => {
  it("agrupa por prueba y peso, un mejor por día y top 3 ordenado", () => {
    const r = implementBests([
      m("2026-10-01", 40),
      m("2026-10-01", 42.5),
      m("2026-10-03", 41),
      m("2026-10-05", 44, 800, "JAVELIN", true),
      m("2026-10-07", 39),
      m("2026-10-02", 46, 700),
      m("2026-10-04", 30, 900, "OTHER"),
      m("2026-10-04", 0),
    ]);
    expect(r.map((x) => x.label)).toEqual(["Jabalina · 800 g", "Jabalina · 700 g", "Pelota u otro implemento · 900 g"]);
    expect(r[0].top).toEqual([
      { date: "2026-10-05", markM: 44, isCompetition: true },
      { date: "2026-10-01", markM: 42.5, isCompetition: false },
      { date: "2026-10-03", markM: 41, isCompetition: false },
    ]);
    expect(r[0].series.map((s) => s.markM)).toEqual([42.5, 41, 44, 39]);
    expect(r[0].competitions).toEqual([{ date: "2026-10-05", markM: 44 }]);
  });

  it("sin marcas, nada", () => {
    expect(implementBests([])).toEqual([]);
  });
});
