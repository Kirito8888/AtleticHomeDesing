import { describe, expect, it } from "vitest";

import { defaultsFor, disciplineForTrack, EVENTS, familyOf, formatSeconds, intervalMetric, intervalStats, paceSecPerKm, sessionHeadline, speedMs } from "./disciplines";

describe("catálogo y familias", () => {
  it("cada especialidad tiene familia y disciplina coherentes", () => {
    for (const [k, e] of Object.entries(EVENTS)) {
      expect(e.label, k).toBeTruthy();
      expect(familyOf(e.discipline, k)).toBe(e.family);
    }
  });
  it("sin perfil se comporta como hasta ahora (lanzamientos)", () => {
    expect(familyOf(null, null)).toBe("throws");
    expect(defaultsFor(null, null)).toEqual({ type: null, modality: null, technicalEvent: null });
    expect(defaultsFor("THROWS", "jabalina")).toEqual({ type: null, modality: null, technicalEvent: "JAVELIN" });
  });
  it("carreras y saltos abren en su pestaña", () => {
    expect(defaultsFor("SPRINT", "100m")).toEqual({ type: "TRACK", modality: "SPRINT", technicalEvent: null });
    expect(defaultsFor("HURDLES", "110mv").modality).toBe("HURDLES");
    expect(defaultsFor("LONG_DISTANCE", null)).toMatchObject({ type: "TRACK", modality: "RUN" });
    expect(defaultsFor("JUMPS", "pertiga")).toEqual({ type: "TECHNICAL", modality: null, technicalEvent: "POLE_VAULT" });
    expect(defaultsFor("JUMPS", null).technicalEvent).toBe("LONG_JUMP");
  });
  it("la disciplina de una sesión de pista sale de la modalidad", () => {
    expect(disciplineForTrack("SPRINT")).toBe("SPRINT");
    expect(disciplineForTrack("RUN", "LONG_DISTANCE")).toBe("LONG_DISTANCE");
    expect(disciplineForTrack("RUN", "THROWS")).toBeNull();
  });
});

describe("métricas con valores conocidos", () => {
  it("ritmo y velocidad", () => {
    expect(paceSecPerKm(10000, 2400)).toBe(240); // 10 km en 40:00 → 4:00/km
    expect(paceSecPerKm(400, 60)).toBe(150); // 2:30/km
    expect(speedMs(100, 11.5)).toBeCloseTo(8.6957, 3);
    expect(paceSecPerKm(100, 11.5)).toBeCloseTo(115, 5); // 1:55/km
    expect(paceSecPerKm(0, 10)).toBeNull();
    expect(speedMs(100, null)).toBeNull();
  });
  it("intervalStats", () => {
    const st = intervalStats([
      { distanceM: 150, timeSec: 18.2 },
      { distanceM: 150, timeSec: 17.9 },
      { distanceM: 150, timeSec: 18.0 },
    ]);
    expect(st).toMatchObject({ count: 3, totalM: 450, bestTimeSec: 17.9, bestDistanceM: 150, uniformDistanceM: 150 });
    expect(st.totalTimeSec).toBeCloseTo(54.1, 5);
    expect(intervalStats([{ distanceM: 200, timeSec: 25 }, { distanceM: 100, timeSec: 12 }]).uniformDistanceM).toBeNull();
    expect(intervalStats([]).bestTimeSec).toBeNull();
  });
  it("formatSeconds", () => {
    expect(formatSeconds(11.5)).toBe("11,50 s");
    expect(formatSeconds(17.9)).toBe("17,90 s");
    expect(formatSeconds(62.34)).toBe("1:02,34");
  });
  it("intervalMetric: m/s en velocidad, ritmo en fondo", () => {
    expect(intervalMetric("SPRINT", 100, 12.5)).toBe("8,00 m/s")
    expect(intervalMetric("SPRINT", 100, 11.5)).toBe("8,70 m/s");
    expect(intervalMetric("RUN", 1000, 240)).toBe("4:00 /km");
  });
});

describe("titulares", () => {
  it("lanzamientos: texto idéntico al previo", () => {
    expect(sessionHeadline({ technical: { event: "JAVELIN", bestMarkM: 62.1 } })).toBe("Jabalina · 62,1 m");
    expect(sessionHeadline({ technical: { event: "JAVELIN", bestMarkM: null } })).toBe("Jabalina");
  });
  it("fuerza: series y tonelaje como antes", () => {
    expect(sessionHeadline({ strength: { setCount: 12, tonnageKg: 4210.5 } })).toBe("12 series · 4210,5 kg");
    expect(sessionHeadline({ strength: { setCount: 0, tonnageKg: null } })).toBe("0 series · 0 kg");
  });
  it("pista: sin series conserva distancia y ritmo", () => {
    expect(sessionHeadline({ track: { modality: "RUN", distanceM: 10500, avgPaceSecPerKm: 260, intervals: [] } })).toBe("10,5 km · 4:20 /km");
  });
  it("velocidad: series y mejor tiempo", () => {
    const h = sessionHeadline({
      track: { modality: "SPRINT", distanceM: null, avgPaceSecPerKm: null, intervals: [{ distanceM: 150, timeSec: 18.2 }, { distanceM: 150, timeSec: 17.9 }] },
    });
    expect(h).toBe("2×150 m · mejor 17,90 s");
  });
});
