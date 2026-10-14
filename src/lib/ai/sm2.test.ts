import { describe, expect, it } from "vitest";

import { nextReview, SM2_INITIAL, sm2 } from "./sm2";

const NOW = new Date("2026-10-14T10:00:00Z");
const day = (n: number) => new Date(NOW.getTime() + n * 86_400_000);

describe("nextReview (SM-2 por persona, sin BD)", () => {
  it("tarjeta nueva (null) equivale al estado inicial y no muta nada", () => {
    const frozen = Object.freeze({ ...SM2_INITIAL });
    expect(nextReview(null, 4, NOW)).toEqual(nextReview(frozen, 4, NOW));
    expect(frozen).toEqual({ easeFactor: 2.5, intervalDays: 0, repetitions: 0 });
  });

  it("serie 1 → 6 → EF·intervalo, con fecha de vencimiento y dificultad registradas", () => {
    const a = nextReview(null, 4, NOW);
    expect(a.state).toMatchObject({ intervalDays: 1, repetitions: 1 });
    expect(a.dueAt).toEqual(day(1));
    expect(a).toMatchObject({ lastReviewedAt: NOW, lastGrade: 4 });
    const b = nextReview(a.state, 4, NOW);
    expect(b.state.intervalDays).toBe(6);
    const c = nextReview(b.state, 5, NOW);
    expect(c.state.intervalDays).toBe(Math.round(6 * b.state.easeFactor));
    expect(c.dueAt).toEqual(day(c.state.intervalDays));
  });

  it("fallo: reinicia la serie, vuelve mañana y el EF baja sin pasar de 1.3", () => {
    let st = { easeFactor: 1.4, intervalDays: 30, repetitions: 5 };
    const f = nextReview(st, 1, NOW);
    expect(f.state).toEqual({ easeFactor: 1.3, intervalDays: 1, repetitions: 0 });
    expect(f.dueAt).toEqual(day(1));
    st = f.state;
    expect(nextReview(st, 0, NOW).state.easeFactor).toBe(1.3);
  });

  it("dos personas con la misma tarjeta evolucionan por separado (función pura)", () => {
    const ana = nextReview(nextReview(null, 5, NOW).state, 5, NOW).state;
    const luis = nextReview(null, 1, NOW).state;
    expect(ana.repetitions).toBe(2);
    expect(luis.repetitions).toBe(0);
    expect(sm2(SM2_INITIAL, 5)).toEqual(nextReview(null, 5, NOW).state);
  });

  it("la nota se acota a 0–5", () => {
    expect(nextReview(null, 9, NOW).lastGrade).toBe(5);
    expect(nextReview(null, -3, NOW).lastGrade).toBe(0);
  });
});
