import { describe, expect, it } from "vitest";

import { bestOfYear, monthlyLoad } from "@/lib/training/season-report";

describe("informe de temporada", () => {
  it("carga por mes con los 12 meses", () => {
    const m = monthlyLoad(
      [
        { date: "2026-01-05", tss: 50.4 },
        { date: "2026-01-07", tss: 60 },
        { date: "2026-03-01", tss: null },
        { date: "2025-12-31", tss: 99 },
      ],
      2026,
    );
    expect(m).toHaveLength(12);
    expect(m[0]).toEqual({ month: "2026-01", sessions: 2, tss: 110 });
    expect(m[2]).toEqual({ month: "2026-03", sessions: 1, tss: 0 });
  });
  it("mejor marca: la mayor en lanzamientos y la menor en carreras", () => {
    const b = bestOfYear([
      { key: "JAVELIN:600", value: 48.2, higherIsBetter: true },
      { key: "JAVELIN:600", value: 50.1, higherIsBetter: true },
      { key: "track:100", value: 12.4, higherIsBetter: false },
      { key: "track:100", value: 12.1, higherIsBetter: false },
    ]);
    expect(b.map((x) => x.value).sort()).toEqual([12.1, 50.1]);
  });
});
