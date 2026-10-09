import { describe, expect, it } from "vitest";

import { type DayCheck, evaluateRules, throwCap, type ThrowSession, weekOf, weeklyThrows } from "./engine";
import { readPrefs } from "./prefs";

// Datos inventados.
const prefs = readPrefs({ weightMinKg: 70 });
const c = (date: string, v: Partial<DayCheck>): DayCheck => ({ date, squeezePain: null, heelPain: null, jumpCm: null, elbowSymptoms: null, bodyWeightKg: null, bodyFatPct: null, hrvRmssdMs: null, ...v });
const t = (date: string, throws: number, video?: [number, number, number]): ThrowSession => ({ date, throws, videoTotal: video?.[0] ?? null, videoElbowOk: video?.[1] ?? null, videoHeadOk: video?.[2] ?? null });
const ids = (a: ReturnType<typeof evaluateRules>) => a.map((x) => x.id).sort();
const TODAY = "2026-11-11"; // miércoles

describe("motor de reglas", () => {
  it("semanas ISO y conteo de lanzamientos con semanas vacías", () => {
    expect(weekOf("2026-11-11")).toBe("2026-11-09");
    expect(weekOf("2026-11-15")).toBe("2026-11-09");
    expect(weeklyThrows([t("2026-11-10", 10), t("2026-10-27", 20)], TODAY, 3)).toEqual([
      { week: "2026-10-26", throws: 20 },
      { week: "2026-11-02", throws: 0 },
      { week: "2026-11-09", throws: 10 },
    ]);
    expect(throwCap([{ throws: 10 }, { throws: 20 }, { throws: 20 }, { throws: 30 }, { throws: 0 }], 1.3)).toBe(26);
  });

  it("sin datos no hay avisos", () => {
    expect(evaluateRules({ today: TODAY, prefs, checks: [], throws: [] })).toEqual([]);
  });

  it("squeeze, dos controles seguidos, talón y codo", () => {
    const a = evaluateRules({
      today: TODAY,
      prefs,
      checks: [c("2026-11-02", { squeezePain: 4 }), c("2026-11-09", { squeezePain: 5, heelPain: 4 }), c("2026-11-10", { elbowSymptoms: true })],
      throws: [],
    });
    expect(ids(a)).toEqual(["elbow", "heel", "squeeze", "squeeze-2"]);
    expect(evaluateRules({ today: TODAY, prefs, checks: [c("2026-11-09", { squeezePain: 3 })], throws: [] })).toEqual([]); // = umbral: no avisa
    expect(evaluateRules({ today: TODAY, prefs, checks: [c("2026-10-30", { squeezePain: 6 })], throws: [] })).toEqual([]); // hace más de 7 días
  });

  it("peso: dos semanas subiendo, cambio en el mes y mínimo personal", () => {
    const checks = [
      c("2026-10-12", { bodyWeightKg: 72 }),
      c("2026-10-19", { bodyWeightKg: 72 }),
      c("2026-10-26", { bodyWeightKg: 72 }),
      c("2026-11-02", { bodyWeightKg: 72.6 }),
      c("2026-11-09", { bodyWeightKg: 73.2 }),
    ];
    expect(ids(evaluateRules({ today: TODAY, prefs, checks, throws: [] }))).toEqual(["weight-block", "weight-up"]);
    expect(ids(evaluateRules({ today: TODAY, prefs, checks: [c("2026-11-02", { bodyWeightKg: 70.2 }), c("2026-11-09", { bodyWeightKg: 69.5 })], throws: [] }))).toEqual(["weight-min"]);
  });

  it("VFC: caída con salto más bajo → aviso; sin otras señales → solo nota", () => {
    const hrv = (week: string, v: number) => [0, 1, 2].map((i) => c(new Date(Date.parse(`${week}T00:00:00Z`) + i * 864e5).toISOString().slice(0, 10), { hrvRmssdMs: v }));
    const base = [...hrv("2026-10-26", 100), ...hrv("2026-11-02", 100)];
    const now = hrv("2026-11-09", 90);
    expect(ids(evaluateRules({ today: TODAY, prefs, checks: [...base, ...now], throws: [] }))).toEqual(["hrv-info"]);
    const jumps = [c("2026-11-02", { jumpCm: 300 / 10 }), c("2026-11-09", { jumpCm: 28 })];
    expect(ids(evaluateRules({ today: TODAY, prefs, checks: [...base, ...now, ...jumps], throws: [] }))).toEqual(["hrv"]);
  });

  it("lanzamientos: tope, 48 h y vuelta tras parar", () => {
    const hist = [t("2026-10-13", 20), t("2026-10-20", 20), t("2026-10-27", 20), t("2026-11-03", 20)];
    expect(ids(evaluateRules({ today: TODAY, prefs, checks: [], throws: [...hist, t("2026-11-09", 30)] }))).toEqual(["throw-cap"]); // 30 > 26
    expect(ids(evaluateRules({ today: TODAY, prefs, checks: [], throws: [...hist, t("2026-11-09", 10), t("2026-11-10", 5)] }))).toEqual(["throw-48h"]);
    expect(ids(evaluateRules({ today: TODAY, prefs, checks: [], throws: [t("2026-10-13", 20), t("2026-10-20", 20)] }))).toEqual(["throw-return"]);
  });

  it("sensaciones: dolor por encima del umbral en los últimos 3 días, la peor por zona", () => {
    const f = (date: string, area: string, pain: number) => ({ date, area, label: area === "KNEE" ? "Rodilla" : "Codo", pain });
    const a = evaluateRules({ today: TODAY, prefs, checks: [], throws: [], feelings: [f("2026-11-10", "KNEE", 5), f("2026-11-11", "KNEE", 6), f("2026-11-11", "ELBOW", 4), f("2026-11-07", "ELBOW", 9)] });
    expect(a.map((x) => x.title)).toEqual(["Molestia en rodilla (6/10)"]);
  });

  it("deuda de sueño, monotonía y vuelta tras lesión", () => {
    const nights = ["2026-11-09", "2026-11-10", "2026-11-11"].map((d) => c(d, { sleepHours: 6 }));
    expect(ids(evaluateRules({ today: TODAY, prefs, checks: nights, throws: [] }))).toEqual(["sleep-debt"]);
    expect(ids(evaluateRules({ today: TODAY, prefs, checks: [], throws: [], loads: [300, 320, 310, 300, 330, 310, 300] }))).toEqual(["monotony"]);
    const back = [t("2026-10-13", 20), t("2026-10-20", 20)];
    expect(ids(evaluateRules({ today: TODAY, prefs, checks: [], throws: back, returnProtocol: { phase: "3 · Carrera e impacto" } }))).toEqual(["return"]);
  });

  it("vídeo contado: dos semanas por debajo del mínimo", () => {
    const a = evaluateRules({ today: TODAY, prefs, checks: [], throws: [t("2026-11-04", 8, [8, 3, 6]), t("2026-11-11", 8, [8, 2, 7])] });
    expect(ids(a)).toEqual(["video-e"]);
  });
});
