import { describe, expect, it } from "vitest";

import { equipmentAlerts, equipmentState } from "./equipment";

describe("material", () => {
  it("el desgaste es el peor entre usos y meses", () => {
    const s = equipmentState({ purchasedOn: "2026-01-01", lifeUses: 1000, lifeMonths: 24 }, 850, "2026-07-01");
    expect(s.usesPct).toBe(85);
    expect(s.monthsPct).toBe(25);
    expect(s).toMatchObject({ wearPct: 85, level: "soon" });
    expect(equipmentState({ purchasedOn: "2024-01-01", lifeUses: null, lifeMonths: 12 }, 0, "2026-01-01").level).toBe("replace");
    expect(equipmentState({ purchasedOn: null, lifeUses: null, lifeMonths: null }, 30, "2026-01-01")).toMatchObject({ wearPct: null, level: "ok" });
  });

  it("solo avisa del material activo gastado", () => {
    const st = (level: "ok" | "soon" | "replace", wearPct: number) => ({ uses: 0, usesPct: wearPct, months: null, monthsPct: null, wearPct, level });
    const a = equipmentAlerts([
      { id: "1", name: "Clavos", retired: false, state: st("replace", 120) },
      { id: "2", name: "Jabalina 800", retired: false, state: st("soon", 90) },
      { id: "3", name: "Viejas", retired: true, state: st("replace", 200) },
      { id: "4", name: "Nuevas", retired: false, state: st("ok", 10) },
    ]);
    expect(a.map((x) => [x.id, x.level])).toEqual([
      ["equip-1", "warn"],
      ["equip-2", "info"],
    ]);
  });
});
