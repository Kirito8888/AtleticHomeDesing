import { describe, expect, it } from "vitest";

import { readPrefs } from "@/lib/rules/prefs";

import { carbDay, carbTarget } from "./carbs";

describe("hidratos según el día", () => {
  it("lanzamientos > gimnasio > otro; sin sesiones = descanso", () => {
    expect(carbDay([])).toBe("rest");
    expect(carbDay([{ event: null, strength: true }, { event: "JAVELIN", strength: false }])).toBe("throw");
    expect(carbDay([{ event: "LONG_JUMP", strength: false }, { event: null, strength: true }])).toBe("heavy");
    expect(carbDay([{ event: null, strength: false }])).toBe("other");
  });

  it("objetivo de Mis reglas; sin configurar, no se ajusta", () => {
    const p = readPrefs({ carbsThrowDayG: 400, carbsRestDayG: 250 });
    expect(carbTarget(p, "throw")).toBe(400);
    expect(carbTarget(p, "heavy")).toBeNull();
    expect(carbTarget(p, "rest")).toBe(250);
    expect(carbTarget(p, "other")).toBeNull();
  });
});
