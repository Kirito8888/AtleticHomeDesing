import { describe, expect, it } from "vitest";

import { dailyLight } from "./daily-light";

const p = { lightReadinessAmber: 60, lightReadinessRed: 40, lightHooperAmber: 14, lightHooperRed: 17, lightPainRed: 6, lightZoneAmber: 7 };
const none = { readiness: null, hooper: null, maxPain: null, protocolPhase: null, zoneFatigue: null, cycleSuggestion: null };

describe("semáforo del día", () => {
  it("verde sin señales", () => {
    expect(dailyLight({ ...none, readiness: 80, hooper: 9 }, p)).toMatchObject({ level: "green", reasons: [] });
    expect(dailyLight(none, p).reasons).toEqual(["sin registro de recuperación de hoy"]);
  });
  it("ámbar con una señal moderada y rojo si alguna es fuerte", () => {
    expect(dailyLight({ ...none, readiness: 55 }, p).level).toBe("amber");
    expect(dailyLight({ ...none, readiness: 80, zoneFatigue: { zone: "hombro", value: 8 } }, p).reasons).toEqual(["fatiga 8/10 en hombro"]);
    const r = dailyLight({ ...none, readiness: 80, maxPain: 7, cycleSuggestion: "Hoy has marcado síntomas" }, p);
    expect(r.level).toBe("red");
    expect(r.reasons).toEqual(["dolor 7/10 en una molestia", "hoy has marcado síntomas"]);
  });
});
