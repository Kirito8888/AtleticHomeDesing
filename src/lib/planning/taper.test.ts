import { describe, expect, it } from "vitest";

import { taperBlocks, taperDays, taperSets } from "./taper";

describe("afinamiento", () => {
  it("recorta series y nunca baja de 1", () => {
    expect(taperSets("3 × 5", 30)).toBe("2 × 5");
    expect(taperSets("4 × 3 y 2 × 2", 50)).toBe("2 × 3 y 1 × 2");
    expect(taperSets("1 × 6", 50)).toBe("1 × 6");
    expect(taperSets("al máximo", 30)).toBe("al máximo");
  });

  it("deja el original a la vista y no toca las rampas", () => {
    const [b] = taperBlocks(
      [{ kind: "table", rows: [{ exercise: "Sentadilla", sets: "3 × 5", load: "80 %", rir: "2", rest: "", how: "", ramp: false }, { exercise: "Rampa", sets: "2 × 3", load: "50 %", rir: "", rest: "", how: "", ramp: true }] }] as never,
      30,
    ) as Array<{ kind: "table"; rows: Array<{ sets: string; how: string }> }>;
    expect(b.rows[0]).toMatchObject({ sets: "2 × 5", how: "Plan original: 3 × 5" });
    expect(b.rows[1].sets).toBe("2 × 3");
  });

  it("elige los días pendientes de la ventana", () => {
    const days = [
      { date: "2026-10-10", done: false },
      { date: "2026-10-14", done: false },
      { date: "2026-10-15", done: true },
      { date: "2026-10-17", done: false },
      { date: null, done: false },
    ];
    expect(taperDays(days, "2026-10-17", 7).map((d) => d.date)).toEqual(["2026-10-10", "2026-10-14"]);
  });
});
