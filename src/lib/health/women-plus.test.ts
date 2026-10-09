import { describe, expect, it } from "vitest";

import type { CycleLogEntry } from "./cycle";
import { boneAlert, boneScreen, completedCycles, cyclePerformance, ironWeek, learnedPrediction, learnedSymptomDays } from "./women-plus";

const DAY = 864e5;
const add = (iso: string, n: number) => new Date(Date.parse(`${iso}T00:00:00Z`) + n * DAY).toISOString().slice(0, 10);

/** 4 ciclos de 28 días desde el 5 de mayo: regla 4 días; dolor el día 1 en todos y migraña el día 25 en 2 de 4. */
function logs(): CycleLogEntry[] {
  const out: CycleLogEntry[] = [];
  for (let c = 0; c < 5; c++) {
    const start = add("2026-05-05", c * 28);
    for (let d = 0; d < 4; d++) out.push({ date: add(start, d), period: true, symptoms: d === 0 ? ["dolor"] : [] });
    if (c < 2) out.push({ date: add(start, 24), period: false, symptoms: ["migrana"] });
  }
  return out;
}
const settings = { avgLength: 28, periodDays: 4, lastStart: null, hormonal: "no" as const, symptoms: [], symptomParts: [] };

describe("ciclo aprendido", () => {
  it("cuenta los ciclos completos", () => {
    expect(completedCycles(settings, logs())).toHaveLength(4);
    expect(completedCycles(settings, logs().slice(0, 9))).toHaveLength(1);
  });

  it("aprende qué días del ciclo suelen tener síntomas", () => {
    const m = learnedSymptomDays(settings, logs())!;
    expect(m.get(1)).toBe(1);
    expect(m.get(25)).toBe(0.5);
    expect(m.get(10)).toBeUndefined();
    expect(learnedSymptomDays(settings, logs().slice(0, 12))).toBeNull();
  });

  it("predice los días futuros con probabilidad ≥ el umbral", () => {
    const last = add("2026-05-05", 4 * 28); // último inicio
    const p = learnedPrediction(settings, logs(), last, add(last, 27), 0.5)!;
    expect(p.map((x) => x.date)).toEqual([last, add(last, 24)]);
    expect(learnedPrediction(settings, logs(), last, add(last, 27), 0.8)!.map((x) => x.date)).toEqual([last]);
    expect(learnedPrediction({ ...settings, hormonal: "si" }, logs(), last, add(last, 27), 0.5)).toBeNull();
  });
});

describe("patrón ciclo–rendimiento", () => {
  it("compara días marcados (regla o síntomas) con el resto e indica si la diferencia es clara", () => {
    const l = logs();
    const marked = new Set(l.map((x) => x.date));
    const days = [];
    for (let i = 0; i < 140; i++) {
      const date = add("2026-05-05", i);
      days.push({ date, rpe: marked.has(date) ? 8 + (i % 2) * 0.2 : 6 + (i % 2) * 0.2, readiness: 70 });
    }
    const r = cyclePerformance(settings, l, days);
    if (!r.ok) throw new Error(r.reason);
    const rpe = r.rows.find((x) => x.metric === "rpe")!;
    expect(rpe.diff).toBe(2);
    expect(rpe.clear).toBe(true);
    expect(r.rows.find((x) => x.metric === "readiness")!.clear).toBe(false);
  });

  it("sin 3 ciclos lo dice", () => {
    expect(cyclePerformance(settings, logs().slice(0, 9), [])).toMatchObject({ ok: false });
  });
});

describe("salud ósea", () => {
  const s = { calciumMin: 3, vitDMin: 30, boneImpactMin: 2 };
  it("fractura previa + regla ausente = rojo", () => {
    const r = boneScreen({ stressFractures: 1, calciumServings: 3, vitaminD: 40, amenorrhea: true, lowEa: false, impactSessions7d: 3 }, s);
    expect(r.level).toBe("red");
    expect(boneAlert(r)?.level).toBe("warn");
  });
  it("calcio bajo o pocos impactos = ámbar; todo bien = sin aviso", () => {
    expect(boneScreen({ stressFractures: 0, calciumServings: 1, vitaminD: null, amenorrhea: false, lowEa: false, impactSessions7d: 3 }, s).level).toBe("amber");
    const ok = boneScreen({ stressFractures: 0, calciumServings: 3, vitaminD: 35, amenorrhea: false, lowEa: false, impactSessions7d: 2 }, s);
    expect(ok.level).toBe("ok");
    expect(boneAlert(ok)).toBeNull();
  });
});

describe("hierro", () => {
  it("suma solo lo conocido y cuenta días con alimentos ricos en hierro", () => {
    const w = ironWeek(
      [
        { date: "2026-10-08", name: "Lentejas", ironMg: 3.3, ironRich: false },
        { date: "2026-10-08", name: "Arroz", ironMg: null, ironRich: false },
        { date: "2026-10-06", name: "Mejillones", ironMg: null, ironRich: true },
        { date: "2026-09-01", name: "Antiguo", ironMg: 10, ironRich: true },
      ],
      "2026-10-09",
    );
    expect(w).toMatchObject({ knownMg: 3.3, daysWithRich: 2, unknown: 2 });
    expect(w.richFoods).toEqual(["Lentejas", "Mejillones"]);
  });
});
