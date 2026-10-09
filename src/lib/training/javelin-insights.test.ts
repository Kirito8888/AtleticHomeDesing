import { describe, expect, it } from "vitest";

import { competitionForecast, conditionsEffect, cueStats, implementEquivalence, minimumStatus, progressionByImplement, type ThrowSession } from "./javelin-insights";

const s = (date: string, marks: number[], o: Partial<ThrowSession> = {}): ThrowSession => ({ date, implementWeightG: 800, isCompetition: false, cue: null, marks, conditions: null, ...o });

describe("análisis de jabalina", () => {
  it("claves técnicas frente a la media del implemento", () => {
    const r = cueStats([s("2026-09-01", [50]), s("2026-09-03", [54], { cue: "Brazo largo" }), s("2026-09-05", [52], { cue: "brazo largo " }), s("2026-09-07", [48], { cue: "rápido" })]);
    expect(r[0]).toEqual({ cue: "brazo largo", sessions: 2, diffM: 2 });
    expect(r[1].cue).toBe("rápido");
  });

  it("equivalencia entre pesos con meses en común", () => {
    const r = implementEquivalence([s("2026-09-01", [50]), s("2026-09-02", [55], { implementWeightG: 700 }), s("2026-10-01", [52]), s("2026-10-02", [57.2], { implementWeightG: 700 }), s("2026-08-01", [60], { implementWeightG: 600 })], 800);
    expect(r).toEqual([
      { weightG: 600, months: 0, ratio: null },
      { weightG: 700, months: 2, ratio: 1.1 },
    ]);
    expect(progressionByImplement([s("2026-09-01", [50, 51]), s("2026-09-20", [52])])[0].months).toEqual([{ month: "2026-09", markM: 52 }]);
  });

  it("condiciones: residuo frente a las 5 sesiones previas", () => {
    const base = ["2026-09-01", "2026-09-03", "2026-09-05"].map((d) => s(d, [50]));
    const windy = ["2026-09-07", "2026-09-09", "2026-09-11"].map((d) => s(d, [48], { conditions: { tempC: 15, windMs: 7 } }));
    const r = conditionsEffect([...base, ...windy]);
    expect(r.sessions).toBe(3);
    expect(r.wind[2].n).toBe(3);
    expect(r.wind[2].residualM).toBeLessThan(0);
    expect(r.wind[0].residualM).toBeNull();
  });

  it("mínima: distancia y si llegas a tiempo con la tendencia", () => {
    const ss = [s("2026-08-20", [48]), s("2026-09-03", [49]), s("2026-09-17", [50]), s("2026-10-01", [51])];
    const st = minimumStatus({ markM: 53, deadline: "2026-12-31", implementWeightG: 800 }, ss, "2026-10-08");
    expect(st).toMatchObject({ seasonBest: 51, gap: 2, reached: false, slopePerWeek: 0.5, weeksToReach: 4, onTrack: true });
    expect(minimumStatus({ markM: 50, deadline: null, implementWeightG: 800 }, ss, "2026-10-08").reached).toBe(true);
  });

  it("previsión: solo con 2 competiciones de referencia", () => {
    const ss = [
      s("2026-05-01", [50]),
      s("2026-05-10", [52], { isCompetition: true }),
      s("2026-06-01", [51]),
      s("2026-06-10", [53.04], { isCompetition: true }),
      s("2026-10-01", [55]),
    ];
    const f = competitionForecast(ss, "2026-10-08", 800);
    if (!f.ok) throw new Error(f.reason);
    expect(f.ratio).toBe(1.04);
    expect(f.markM).toBe(57.2);
    expect(competitionForecast(ss.slice(0, 3), "2026-10-08", 800).ok).toBe(false);
  });
});
