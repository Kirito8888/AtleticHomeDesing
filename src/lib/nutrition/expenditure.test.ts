import { describe, expect, it } from "vitest";

import { completeIntakeDays, type DayInput, estimateExpenditure, type Estimate, linearTrend, weeklyDraft } from "./expenditure";

const iso = (i: number) => new Date(Date.UTC(2026, 9, 1 + i)).toISOString().slice(0, 10);
/** 28 días: come `kcal` y el peso va de `w0` cambiando `perWeek` kg/semana; pesaje cada `every` días. */
function days(o: { kcal?: number; w0?: number; perWeek?: number; every?: number; n?: number } = {}): DayInput[] {
  const { kcal = 2500, w0 = 70, perWeek = -0.25, every = 2, n = 28 } = o;
  return Array.from({ length: n }, (_, i) => ({ day: iso(i), kcal, weightKg: i % every === 0 ? w0 + (perWeek / 7) * i : null }));
}

describe("linearTrend", () => {
  it("recta exacta: pendiente y error 0", () => {
    const t = linearTrend([0, 1, 2, 3].map((x) => ({ x, y: 2 * x + 1 })));
    expect(t.slope).toBeCloseTo(2);
    expect(t.intercept).toBeCloseTo(1);
    expect(t.slopeSe).toBeCloseTo(0);
  });
});

describe("completeIntakeDays", () => {
  it("descarta los días anotados a medias (< 60 % de la mediana o < 800 kcal)", () => {
    const d = days();
    d[3].kcal = 1200; // < 60 % de 2500
    d[4].kcal = 0; // sin anotar: ni cuenta ni se descarta
    d[5].kcal = null;
    const r = completeIntakeDays(d);
    expect(r.kept).toHaveLength(25);
    expect(r.excluded).toBe(1);
  });
});

describe("estimateExpenditure", () => {
  it("come 2500 y baja 0,25 kg/semana → gasto ≈ 2500 + 275", () => {
    const r = estimateExpenditure(days(), 40);
    expect(r.status).toBe("ok");
    const e = r as Estimate;
    expect(e.kcal).toBeGreaterThanOrEqual(2770);
    expect(e.kcal).toBeLessThanOrEqual(2780);
    expect(e.weeklyChangeKg).toBeCloseTo(-0.25, 2);
    expect(e.avgIntakeKcal).toBe(2500);
  });

  it("los días a medias no bajan el gasto (no empujan a comer menos)", () => {
    const d = days({ perWeek: 0 });
    for (const i of [1, 6, 11, 16]) d[i].kcal = 900;
    const e = estimateExpenditure(d, 40) as Estimate;
    expect(e.kcal).toBe(2500);
    expect(e.excludedDays).toBe(4);
  });

  it("menos de 3 semanas de historia → calibrando, sin número", () => {
    const r = estimateExpenditure(days(), 15);
    expect(r.status).toBe("calibrating");
    expect("kcal" in r).toBe(false);
  });

  it("pocos días de comida o pesajes juntos → calibrando con los motivos", () => {
    const d = days({ every: 30 }).map((x, i) => ({ ...x, kcal: i < 10 ? 2500 : null }));
    const r = estimateExpenditure(d, 60);
    expect(r.status).toBe("calibrating");
    if (r.status === "calibrating") {
      expect(r.reasons).toHaveLength(2);
      expect(r.progress.intakeDays).toBe(10);
    }
  });

  it("un pesaje mal escrito que dispara el resultado → aviso, no un número", () => {
    const d = days({ perWeek: 0 });
    d[26].weightKg = 7; // 70 escrito como 7
    expect(estimateExpenditure(d, 40).status).toBe("incoherent");
  });
});

const est = (kcal: number, w = 70): Estimate => ({ status: "ok", kcal, marginKcal: 100, avgIntakeKcal: kcal, weeklyChangeKg: 0, trendWeightKg: w, intakeDays: 20, excludedDays: 0, weighIns: 10 });

describe("weeklyDraft", () => {
  const current = { kcal: 2400, proteinG: 130, carbsG: 300, fatG: 70 };

  it("mantener: va hacia el gasto como mucho 150 kcal por semana y solo mueve los hidratos", () => {
    const d = weeklyDraft({ estimate: est(2800), current, goal: "maintain", age: 25 });
    expect(d.status).toBe("draft");
    if (d.status === "draft") {
      expect(d.goal.kcal).toBe(2550);
      expect(d.capped).toBe(true);
      expect(d.targetKcal).toBe(2800);
      expect(d.goal.proteinG).toBe(130);
      expect(d.goal.fatG).toBe(70);
      expect(d.goal.carbsG).toBe(Math.round((2550 - 130 * 4 - 70 * 9) / 4));
    }
  });

  it("bajar: el déficit nunca pasa de 300 kcal sobre el gasto", () => {
    const d = weeklyDraft({ estimate: est(2500), current: { ...current, kcal: 2250 }, goal: "lose", age: 25 });
    expect(d.status).toBe("draft");
    if (d.status === "draft") expect(d.targetKcal).toBe(2200);
  });

  it("si el objetivo actual está muy por debajo del gasto, lo sube (también al querer bajar)", () => {
    const d = weeklyDraft({ estimate: est(2800), current: { ...current, kcal: 1800 }, goal: "lose", age: 25 });
    if (d.status !== "draft") throw new Error("se esperaba borrador");
    expect(d.goal.kcal).toBe(1950);
  });

  it("menores de 18: solo mantener, con aviso", () => {
    const d = weeklyDraft({ estimate: est(2500), current: { ...current, kcal: 2500 }, goal: "lose", age: 16 });
    expect(d.status).toBe("none");
    const d2 = weeklyDraft({ estimate: est(2700), current, goal: "lose", age: 16 });
    if (d2.status !== "draft") throw new Error("se esperaba borrador");
    expect(d2.targetKcal).toBe(2700);
    expect(d2.note).toMatch(/18 años/);
  });

  it("si ya encaja (± 50 kcal), no propone cambios", () => {
    expect(weeklyDraft({ estimate: est(2430), current, goal: "maintain", age: 30 }).status).toBe("none");
  });

  it("sin objetivo: propone el de la meta con proteína 1,6 g/kg y grasa 1 g/kg", () => {
    const d = weeklyDraft({ estimate: est(2600, 60), current: null, goal: "gain", age: 30 });
    if (d.status !== "draft") throw new Error("se esperaba borrador");
    expect(d.goal).toMatchObject({ kcal: 2850, proteinG: 96, fatG: 60 });
  });
});
