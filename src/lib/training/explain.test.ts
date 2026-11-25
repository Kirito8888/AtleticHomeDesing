import { describe, expect, it } from "vitest";

import { explainAcwr, explainAtl, explainCtl, explainE1rmChange, explainPmc, explainRamp, explainReadiness, explainTsb } from "./explain";

const base = { ctl: 40, atl: 40, acwr: 1, rampRate: 2 };

describe("explainPmc", () => {
  it.each([
    [-26, "Fatiga alta acumulada"],
    [-25, "Bloque de carga"],
    [-11, "Bloque de carga"],
    [-10, "Equilibrio"],
    [0, "Equilibrio"],
    [5, "Equilibrio"],
    [6, "Fresca"],
    [25, "Fresca"],
    [26, "Descanso largo"],
  ])("TSB %s → %s", (tsb, start) => {
    expect(explainPmc({ ...base, tsb })).toMatch(new RegExp(`^${start}`));
  });

  it("un solo matiz, por prioridad", () => {
    expect(explainPmc({ ...base, tsb: 0, acwr: 1.6, rampRate: 9, ctl: 5 })).toContain("pico de carga");
    expect(explainPmc({ ...base, tsb: 0, acwr: 1.2, rampRate: 9, ctl: 5 })).toContain("sube rápido");
    expect(explainPmc({ ...base, tsb: 0, ctl: 5 })).toContain("base de fitness aún baja");
    expect(explainPmc({ ...base, tsb: 0 })).not.toContain(";");
  });

  it("una línea, corta y sin recuperación", () => {
    for (const tsb of [-40, -15, 0, 10, 40]) {
      const s = explainPmc({ ctl: 5, atl: 60, tsb, acwr: 1.9, rampRate: 12 });
      expect(s.length).toBeLessThanOrEqual(120);
      expect(s).not.toContain("\n");
      expect(s).not.toMatch(/sueño|VFC|readiness|FC |agujetas|bienestar/i);
    }
  });
});

describe("explainReadiness", () => {
  it("sin puntuación → null", () => {
    expect(explainReadiness({ score: null, parts: {} })).toBeNull();
  });
  it("nombra el factor que más resta", () => {
    const s = explainReadiness({ score: 60, label: "MODERATE", parts: { hrv: 80, sleep: 30, tsb: 70, doms: 90 }, usedWeight: 0.9 });
    expect(s).toBe("Moderado: lo que más resta hoy es el sueño (30/100).");
  });
  it("pondera por peso", () => {
    // VFC 40 (−35·0,3 = −10,5) pesa más que bienestar 20 (−55·0,1 = −5,5)
    const s = explainReadiness({ score: 55, label: "MODERATE", parts: { hrv: 40, wellness: 20 }, usedWeight: 0.4 });
    expect(s).toContain("la VFC");
    expect(s).toContain("con pocos datos");
  });
  it("si nada resta, nombra el que más suma", () => {
    const s = explainReadiness({ score: 90, label: "READY", parts: { hrv: 95, sleep: 80 }, usedWeight: 1 });
    expect(s).toBe("Listo: lo que más suma hoy es la VFC frente a tu línea base (95/100).");
  });
  it("sin componentes, solo la etiqueta", () => {
    expect(explainReadiness({ score: 80, label: "READY", parts: {} })).toBe("Listo.");
  });
});

describe("«por qué» de cada número de Rendimiento (v3.2 I)", () => {
  it("CTL y ATL describen el nivel sin inventar", () => {
    expect(explainCtl(5)).toMatch(/base aún baja/);
    expect(explainCtl(80)).toMatch(/base alta/);
    expect(explainAtl(60, 40)).toMatch(/bastante por encima/);
    expect(explainAtl(30, 40)).toMatch(/por debajo/);
  });
  it("TSB usa los mismos cortes que tsbStatus", () => {
    expect(explainTsb(-30)).toMatch(/fatiga alta/);
    expect(explainTsb(-15)).toMatch(/bloque de carga/);
    expect(explainTsb(0)).toMatch(/equilibrio/);
    expect(explainTsb(10)).toMatch(/fresca/);
    expect(explainTsb(30)).toMatch(/descanso largo/);
  });
  it("ACWR y rampa: sin datos lo dicen, y marcan zonas", () => {
    expect(explainAcwr(null)).toMatch(/28 días/);
    expect(explainAcwr(1)).toMatch(/dentro de la zona/);
    expect(explainAcwr(1.6)).toMatch(/pico/);
    expect(explainAcwr(0.5)).toMatch(/por debajo/);
    expect(explainRamp(undefined)).toMatch(/sin datos/);
    expect(explainRamp(9)).toMatch(/agresiva/);
    expect(explainRamp(6)).toMatch(/exigente/);
    expect(explainRamp(-2)).toMatch(/baja/);
  });
  it("e1RM: cita kg, % y periodo", () => {
    expect(explainE1rmChange({ kg: 5, pct: 4 }, 90)).toMatch(/\+5.*\+4.*90 días/);
    expect(explainE1rmChange({ kg: -2, pct: -1.5 }, 30)).not.toMatch(/\+/);
  });
});
