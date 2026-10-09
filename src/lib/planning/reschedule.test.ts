import { describe, expect, it } from "vitest";

import { rescheduleOptions } from "./reschedule";

describe("recolocar una sesión", () => {
  const base = { today: "2026-10-12", horizon: 7, isThrow: true, throwDates: ["2026-10-13"], minHours: 48, examDates: ["2026-10-15"], symptomDates: [], busy: { "2026-10-12": 1 } };

  it("nunca propone un día que rompa las 48 h entre lanzamientos", () => {
    const o = rescheduleOptions(base);
    expect(o.map((x) => x.date)).not.toContain("2026-10-12");
    expect(o.map((x) => x.date)).not.toContain("2026-10-14");
    expect(o[0].date).toBe("2026-10-16");
  });

  it("explica por qué un día es peor", () => {
    const o = rescheduleOptions({ ...base, isThrow: false, horizon: 4 });
    expect(o.map((x) => x.date)).toEqual(["2026-10-13", "2026-10-12", "2026-10-14"]);
    expect(o[2].notes).toEqual(["víspera de examen"]);
    expect(o[1].notes).toEqual(["ya hay 1 sesión"]);
  });
});
