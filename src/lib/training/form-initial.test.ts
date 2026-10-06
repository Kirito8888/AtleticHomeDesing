import { describe, expect, it } from "vitest";

import { isEditableType, sessionToFormInitial } from "./form-initial";

const base = {
  type: "STRENGTH",
  date: new Date("2026-10-01T00:00:00Z"),
  title: "Pierna",
  durationSec: 4500,
  sessionRpe: 8,
  notes: null,
  status: "COMPLETED",
  strength: null,
  technical: null,
  track: null,
};

describe("sessionToFormInitial", () => {
  it("agrupa series consecutivas del mismo ejercicio en bloques", () => {
    const set = (exerciseId: string, reps: number) => ({ exerciseId, reps, weightKg: 100, rpe: null, isWarmup: false });
    const r = sessionToFormInitial({ ...base, strength: { sets: [set("sq", 5), set("sq", 5), set("dl", 3)] } });
    expect(r.date).toBe("2026-10-01");
    expect(r.minutes).toBe("75");
    expect(r.blocks?.map((b) => [b.exerciseId, b.sets.length])).toEqual([
      ["sq", 2],
      ["dl", 1],
    ]);
  });

  it("conserva las centésimas de los sprints y usa ids negativos en intentos", () => {
    const r = sessionToFormInitial({
      ...base,
      type: "TRACK",
      track: {
        modality: "SPRINT",
        surface: null,
        distanceM: 300,
        movingTimeSec: 600,
        hrAvg: null,
        hrMax: null,
        intervals: [{ distanceM: 100, timeSec: 11.45, recoverySec: 180 }],
      },
    });
    expect(r.track?.intervals[0]).toEqual({ distanceM: "100", time: "11.45", recovery: "3:00" });
    expect(r.track?.time).toBe("10:00");

    const t = sessionToFormInitial({
      ...base,
      type: "TECHNICAL",
      technical: {
        event: "JAVELIN",
        implementWeightG: 800,
        approachType: null,
        approachSteps: null,
        isCompetition: false,
        focus: null,
        attempts: [{ markM: 55.2, isFoul: false, rating: null, windMs: null, runUpNotes: null, blockNotes: null, releaseNotes: null }],
      },
    });
    expect(t.technical?.attempts[0].id).toBeLessThan(0);
  });

  it("aplica overrides (repetir sesión) y detecta tipos no editables", () => {
    expect(sessionToFormInitial(base, { date: "2026-10-06", rpe: null }).date).toBe("2026-10-06");
    expect(isEditableType("MIXED")).toBe(false);
  });
});
