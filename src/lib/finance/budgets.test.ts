import { describe, expect, it } from "vitest";

import { budgetProgress, distribution, isMonth, monthWindow, shiftMonth } from "./budgets";

describe("budgetProgress", () => {
  it("160 de 200 € = 80 % y aviso", () => {
    expect(budgetProgress(16000, 20000)).toMatchObject({ pct: 80, state: "WARNING", overCents: 0, remainingCents: 4000 });
  });
  it("220 de 200 € = 110 %, excedido en 20 € y la barra se queda en 100", () => {
    expect(budgetProgress(22000, 20000)).toMatchObject({ pct: 110, barPct: 100, state: "EXCEEDED", overCents: 2000, remainingCents: 0 });
  });
  it("79 % sigue en OK y 100 % justo ya es excedido", () => {
    expect(budgetProgress(15800, 20000).state).toBe("OK");
    expect(budgetProgress(20000, 20000).state).toBe("EXCEEDED");
  });
  it("respeta el umbral propio y un límite de 0 no divide por cero", () => {
    expect(budgetProgress(5000, 10000, 50).state).toBe("WARNING");
    expect(budgetProgress(500, 0)).toMatchObject({ pct: 0, state: "OK" });
  });
});

describe("meses", () => {
  it("ventana de febrero (bisiesto y no) y de diciembre", () => {
    expect(monthWindow("2028-02").end.getUTCDate()).toBe(29);
    expect(monthWindow("2027-02").end.getUTCDate()).toBe(28);
    expect(monthWindow("2026-12").end.toISOString().slice(0, 10)).toBe("2026-12-31");
  });
  it("shiftMonth cruza el año y isMonth valida", () => {
    expect(shiftMonth("2026-01", -1)).toBe("2025-12");
    expect(shiftMonth("2026-12", 1)).toBe("2027-01");
    expect(isMonth("2026-13")).toBe(false);
    expect(isMonth("2026-10")).toBe(true);
  });
});

describe("distribution", () => {
  const r = (n: number) => Array.from({ length: n }, (_, i) => ({ key: `c${i}`, name: `C${i}`, cents: (n - i) * 1000 }));
  it("suma siempre 100", () => {
    const s = distribution([{ key: "a", name: "A", cents: 100 }, { key: "b", name: "B", cents: 100 }, { key: "c", name: "C", cents: 100 }]);
    expect(s.reduce((x, y) => x + y.pct, 0)).toBe(100);
  });
  it("agrupa en «Otras» a partir de la sexta y ordena de mayor a menor", () => {
    const s = distribution(r(9));
    expect(s).toHaveLength(6);
    expect(s[5].name).toBe("Otras");
    expect(s[5].cents).toBe((4 + 3 + 2 + 1) * 1000);
    expect(s[0].cents).toBeGreaterThanOrEqual(s[1].cents);
    expect(s.reduce((x, y) => x + y.pct, 0)).toBe(100);
  });
  it("sin gasto no hay partes", () => {
    expect(distribution([])).toEqual([]);
    expect(distribution([{ key: "a", name: "A", cents: 0 }])).toEqual([]);
  });
});
