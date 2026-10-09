import { describe, expect, it } from "vitest";

import type { CycleSettings } from "./cycle";
import {
  energyAvailability,
  exerciseKcal,
  keySessionClashes,
  labAlerts,
  pelvicAlert,
  periodAlerts,
  postpartumStatus,
  predictedDays,
  readWomenSettings,
  screenResult,
} from "./women";

// Datos inventados.
const cyc = (over: Partial<CycleSettings> = {}): CycleSettings => ({ avgLength: 28, periodDays: 5, lastStart: null, hormonal: "no", symptoms: [], symptomParts: [], ...over });
const per = (date: string) => ({ date, period: true, symptoms: [] });

describe("disponibilidad energética", () => {
  it("gasto del ejercicio por duración y RPE (sin contar el reposo)", () => {
    expect(exerciseKcal({ durationSec: 3600, sessionRpe: 5, type: "STRENGTH" }, 60)).toBe(300); // MET 6 − 1 = 5 × 60 × 1 h
    expect(exerciseKcal({ durationSec: null, sessionRpe: 8, type: "TRACK" }, 60)).toBe(0);
    expect(exerciseKcal({ durationSec: 1800, sessionRpe: null, type: "TECHNICAL" }, 60)).toBe(150); // RPE por defecto 5
  });

  it("media de los días con comida; aviso por debajo del umbral; sin datos lo dice", () => {
    const days = ["01", "02", "03", "04", "05"].map((d) => ({ date: `2026-10-${d}`, intakeKcal: 2000, exerciseKcal: 600 }));
    const r = energyAvailability(days, 60, 20, 30); // MLG 48 kg → (2000 − 600) / 48 = 29,2
    expect(r).toMatchObject({ ok: true, ffmKg: 48, mean: 29.2, low: true });
    expect(energyAvailability(days, 60, null, 30)).toMatchObject({ ok: false });
    expect(energyAvailability(days.slice(0, 3), 60, 20, 30)).toMatchObject({ ok: false });
  });

  it("cribado: una respuesta roja basta; dos ámbar = vigilar", () => {
    expect(screenResult({ stressFracture: true }).level).toBe("red");
    expect(screenResult({ gut: true, fatigue: true }).level).toBe("amber");
    expect(screenResult({ gut: true }).level).toBe("ok");
  });
});

describe("regla ausente o irregular", () => {
  it("más de 90 días sin regla avisa; con anticonceptivo hormonal no", () => {
    const logs = [per("2026-06-01"), per("2026-06-02")];
    expect(periodAlerts(cyc(), logs, "2026-09-15").map((a) => a.id)).toEqual(["amenorrhea"]);
    expect(periodAlerts(cyc({ hormonal: "si" }), logs, "2026-09-15")).toEqual([]);
    expect(periodAlerts(null, logs, "2026-09-15")).toEqual([]);
  });

  it("dos ciclos seguidos de más de 35 días", () => {
    const logs = [per("2026-05-01"), per("2026-06-10"), per("2026-07-20")];
    expect(periodAlerts(cyc(), logs, "2026-07-25").map((a) => a.id)).toEqual(["long-cycles"]);
  });
});

describe("analíticas y suelo pélvico", () => {
  const s = readWomenSettings({ ferritinMin: 30, labEveryMonths: 6 });
  it("ferritina baja (la última) y analítica pendiente", () => {
    const labs = [
      { kind: "LAB" as const, date: "2026-01-10", values: { ferritin: 45 } },
      { kind: "LAB" as const, date: "2026-03-10", values: { ferritin: 22, hemoglobin: 12.5 } },
    ];
    expect(labAlerts(labs, s, "2026-05-01").map((a) => a.id)).toEqual(["ferritin"]);
    expect(labAlerts(labs, s, "2026-09-11").map((a) => a.id)).toEqual(["ferritin", "lab-due"]);
  });

  it("síntomas de suelo pélvico en los últimos 7 días", () => {
    const logs = [{ kind: "PELVIC" as const, date: "2026-10-05", symptoms: ["leakJump" as const] }];
    expect(pelvicAlert(logs, "2026-10-07")?.message).toMatch(/Pérdidas de orina al saltar/);
    expect(pelvicAlert(logs, "2026-10-20")).toBeNull();
  });
});

describe("posparto por fases", () => {
  it("avanza solo con el tiempo y los criterios", () => {
    const base = { postpartumSince: "2026-06-01", cleared: false, ppDone: [] as string[] };
    expect(postpartumStatus(base, "2026-07-20")).toMatchObject({ phase: 0, blockedBy: "criteria" }); // 7 semanas, sin alta
    expect(postpartumStatus({ ...base, cleared: true }, "2026-07-20")).toMatchObject({ phase: 1, blockedBy: "criteria" });
    expect(postpartumStatus({ ...base, cleared: true, ppDone: ["walk30", "balance", "squat1"] }, "2026-07-20")).toMatchObject({ phase: 1, blockedBy: "time" });
    expect(postpartumStatus({ ...base, cleared: true, ppDone: ["walk30", "balance", "squat1"] }, "2026-09-01")).toMatchObject({ phase: 2, weeks: 13 });
    expect(postpartumStatus({ ...base, postpartumSince: null }, "2026-09-01")).toBeNull();
  });
});

describe("el ciclo en la planificación", () => {
  it("días previstos y sesiones clave que chocan", () => {
    const settings = cyc({ lastStart: "2026-10-01", symptomParts: ["regla"] });
    const days = predictedDays(settings, [], "2026-10-01", "2026-10-31");
    expect(days.filter((d) => d.period).map((d) => d.date)).toEqual(["2026-10-01", "2026-10-02", "2026-10-03", "2026-10-04", "2026-10-05", "2026-10-29", "2026-10-30", "2026-10-31"]);
    const clash = keySessionClashes(days, [
      { id: "a", date: "2026-10-02", title: "Fuerza · SERIE DE TEST", kind: "session" },
      { id: "b", date: "2026-10-03", title: "Fuerza A", kind: "session" },
      { id: "c", date: "2026-10-30", title: "Autonómico", kind: "event", eventType: "COMPETITION" },
      { id: "d", date: "2026-10-15", title: "Test de 30 m", kind: "session" },
    ]);
    expect(clash.map((c) => c.id)).toEqual(["a", "c"]);
    expect(predictedDays(cyc({ hormonal: "si", lastStart: "2026-10-01" }), [], "2026-10-01", "2026-10-31")).toEqual([]);
  });
});
