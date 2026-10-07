import { describe, expect, it } from "vitest";

import { isEditableType, sessionToFormInitial, templateToFormInitial } from "./form-initial";

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
    expect(isEditableType("MIXED")).toBe(true); // con el interruptor «sesión mixta»
  });
});

describe("templateToFormInitial", () => {
  it("convierte el cuerpo guardado (sin fecha) en el formulario del día", () => {
    const payload = {
      type: "STRENGTH",
      title: "Fuerza A",
      discipline: "STRENGTH",
      status: "COMPLETED",
      durationSec: 3600,
      strength: { sets: [{ exerciseId: "sq", reps: 5, weightKg: 100 }, { exerciseId: "sq", reps: 5, weightKg: 105, rpe: 8 }] },
    };
    const r = templateToFormInitial(payload, "2026-10-06");
    expect(r.date).toBe("2026-10-06");
    expect(r.title).toBe("Fuerza A");
    expect(r.minutes).toBe("60");
    expect(r.blocks).toHaveLength(1);
    expect(r.blocks?.[0].sets.map((x) => x.weightKg)).toEqual([100, 105]);
  });

  it("rechaza una plantilla que ya no es una sesión válida", () => {
    expect(() => templateToFormInitial({ type: "STRENGTH", strength: { sets: [{ exerciseId: "", reps: -1 }] } }, "2026-10-06")).toThrow();
  });
});
