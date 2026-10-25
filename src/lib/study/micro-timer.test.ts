import { describe, expect, it } from "vitest";

import { beginFocus, clampPreset, completeStep, intervalProgress, isFinished, pause, remainingMs, resume, startStep, stepsProgress, tick } from "@/lib/study/micro-timer";

const P = { focus: 15, rest: 3 };
const T0 = 1_000_000;
const MIN = 60_000;

describe("micro-timer", () => {
  it("foco → descanso → espera", () => {
    let r = startStep(1, P, T0);
    expect(remainingMs(r, T0)).toBe(15 * MIN);
    expect(tick(r, T0 + 14 * MIN)).toBe(r);
    r = tick(r, T0 + 15 * MIN);
    expect(r.phase).toBe("rest");
    expect(remainingMs(r, T0 + 15 * MIN)).toBe(3 * MIN);
    r = tick(r, T0 + 18 * MIN);
    expect(r.phase).toBe("idle");
    expect(beginFocus(r, T0 + 20 * MIN).phase).toBe("focus");
  });
  it("la pausa congela el restante y reanudar desplaza el fin", () => {
    let r = pause(startStep(0, P, T0), T0 + 5 * MIN);
    expect(remainingMs(r, T0 + 99 * MIN)).toBe(10 * MIN);
    expect(tick(r, T0 + 99 * MIN)).toBe(r);
    r = resume(r, T0 + 30 * MIN);
    expect(r.endAt).toBe(T0 + 40 * MIN);
  });
  it("progreso del intervalo", () => {
    const r = startStep(0, P, T0);
    expect(intervalProgress(r, T0)).toBe(0);
    expect(intervalProgress(r, T0 + 7.5 * MIN)).toBeCloseTo(0.5);
    expect(intervalProgress(r, T0 + 99 * MIN)).toBe(1);
  });
  it("completar salta al siguiente pendiente y detecta el final", () => {
    let r = startStep(1, P, T0, [2]);
    r = completeStep(r, 4);
    expect(r.phase).toBe("idle");
    expect(r.stepIndex).toBe(3);
    expect(stepsProgress(r, 4)).toBe(0.5);
    r = completeStep(r, 4);
    expect(r.stepIndex).toBe(0);
    expect(isFinished(r, 4)).toBe(false);
    r = completeStep(r, 4);
    expect(isFinished(r, 4)).toBe(true);
  });
  it("acota los presets", () => {
    expect(clampPreset({ focus: 90, rest: 0 })).toEqual({ focus: 30, rest: 3 });
    expect(clampPreset({ focus: 1, rest: 99 })).toEqual({ focus: 5, rest: 10 });
  });
});
