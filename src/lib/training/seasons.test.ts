import { describe, expect, it } from "vitest";

import { compareSeasons } from "./seasons";

describe("comparar temporadas", () => {
  it("año a año: sesiones, carga semanal, lanzamientos, días con molestias y mejores marcas", () => {
    const r = compareSeasons(
      [
        { date: "2025-03-01", sessionRpe: 6, durationSec: 3600, throws: 20, best: { key: "JAVELIN|800", markM: 48 } },
        { date: "2025-06-01", sessionRpe: 7, durationSec: 3600, throws: 0, best: null },
        { date: "2026-02-01", sessionRpe: 8, durationSec: 1800, throws: 30, best: { key: "JAVELIN|800", markM: 51.2 } },
      ],
      [{ startedOn: "2025-12-25", resolvedOn: "2026-01-03" }],
      "2026-01-29",
    );
    expect(r.map((s) => s.season)).toEqual(["2026", "2025"]);
    expect(r[1]).toMatchObject({ sessions: 2, throws: 20, injuryDays: 7, bests: { "JAVELIN|800": 48 } });
    expect(r[1].weeklyLoad).toBe(Math.round((360 + 420) / 52));
    expect(r[0]).toMatchObject({ injuryDays: 3, bests: { "JAVELIN|800": 51.2 } });
  });
});

describe("tiempos de pista (menor es mejor)", () => {
  it("la mejor marca de un tiempo es la menor y convive con las de lanzamientos", () => {
    const base = { sessionRpe: null, durationSec: null, throws: 0 };
    const [s] = compareSeasons(
      [
        { ...base, date: "2026-03-01", best: null, marks: [{ key: "track|100", markM: 12.4, higherIsBetter: false }] },
        { ...base, date: "2026-04-01", best: { key: "JAVELIN|", markM: 40 }, marks: [{ key: "track|100", markM: 12.1, higherIsBetter: false }] },
        { ...base, date: "2026-05-01", best: { key: "JAVELIN|", markM: 38 }, marks: [{ key: "track|100", markM: 12.3, higherIsBetter: false }] },
      ],
      [],
      "2026-10-15",
    );
    expect(s.bests).toEqual({ "track|100": 12.1, "JAVELIN|": 40 });
  });
});
