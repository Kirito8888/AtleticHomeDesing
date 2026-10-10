import { describe, expect, it } from "vitest";

import { achillesScore, breathingPhase, caffeineAtBed, hoursInBed, mobilityFor, moodTrend, quickDashScore, sleepEntrySchema, sleepTips } from "./wellbeing";

describe("bienestar v1.7", () => {
  it("sueño: horas en la cama cruzando la medianoche, cafeína residual y consejos", () => {
    expect(hoursInBed("23:30", "07:00")).toBe(7.5);
    expect(caffeineAtBed(200, "18:00", "23:00")).toBe(100); // 5 h = una vida media
    const e = sleepEntrySchema.parse({ date: "2026-10-09", bedtime: "00:30", wakeTime: "07:00", quality: 2, caffeineMg: 150, lastCaffeine: "19:00", latencyMin: 45 });
    const tips = sleepTips(e);
    expect(tips.join(" ")).toMatch(/cafeína/);
    expect(tips.join(" ")).toMatch(/Menos de 7,5 h/);
    expect(tips.join(" ")).toMatch(/30 min/);
  });

  it("ánimo: aviso con varios días bajos y con estrés que sube", () => {
    const rows = [
      ...[0, 1, 2].map((d) => ({ date: `2026-10-0${9 - d}`, mood: 2, stress: 4 })),
      ...[10, 12, 15].map((d) => ({ date: `2026-09-${30 - d + 9}`, mood: 4, stress: 2 })),
    ];
    const t = moodTrend(rows, "2026-10-09");
    expect(t).toMatchObject({ mood: 2, stress: 4, n: 3 });
    expect(t.alerts).toHaveLength(2);
    expect(t.alerts[0]).toMatch(/024/);
  });

  it("escalas propias: brazo y hombro, y Aquiles", () => {
    expect(quickDashScore(Array(11).fill(1))).toBe(0);
    expect(quickDashScore(Array(11).fill(5))).toBe(100);
    expect(quickDashScore([...Array(9).fill(3), null, null])).toBeNull();
    expect(achillesScore(Array(8).fill(10))).toBe(100);
    expect(achillesScore([5, 5, 5, 5, 5, 5, 5, 5])).toBe(50);
  });

  it("movilidad por zona fatigada y respiración por fases", () => {
    expect(mobilityFor({ hombro: 8, rodilla: 5, codo: 9 }, 7).map((m) => m.zone)).toEqual(["codo", "hombro"]);
    expect(breathingPhase("caja", 0)).toMatchObject({ name: "Inhala", remaining: 4 });
    expect(breathingPhase("caja", 5)).toMatchObject({ name: "Mantén", remaining: 3 });
    expect(breathingPhase("4-7-8", 19).cycles).toBe(1);
  });
});
