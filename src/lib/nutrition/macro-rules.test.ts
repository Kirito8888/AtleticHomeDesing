import { describe, expect, it } from "vitest";

import { readPrefs } from "@/lib/rules/prefs";

import { applyRule, pruneDayTargets, resolveDayTarget, sessionKind, type BaseGoal, type SessionFacts, weekdayOf } from "./macro-rules";

const base: BaseGoal = { kcal: 2400, proteinG: 120, carbsG: 300, fatG: 70, fiberG: 30, trainingDayKcalFactor: 1.1 };
const th = { longRunMinKm: 16, longRunMinMin: 75, highLoadRpe: 8 };
const sess = (o: Partial<SessionFacts> = {}): SessionFacts => ({ type: "TRACK", hasStrength: false, hasTechnical: false, durationSec: 1800, sessionRpe: 5, track: null, ...o });
const rule = (o: object) => ({ mode: "delta" as const, kcal: null, proteinG: null, carbsG: null, fatG: null, ...o });
const P = (o: object) => readPrefs(o);
const resolve = (prefs: object, kind: ReturnType<typeof sessionKind>, isoDay = "2026-11-17", b: BaseGoal | null = base) =>
  resolveDayTarget({ base: b, trained: kind !== "rest", kind, isoDay, prefs: P(prefs), legacyKind: "rest" });

describe("sessionKind", () => {
  it("descanso sin sesiones, competición manda", () => {
    expect(sessionKind([], false, th)).toBe("rest");
    expect(sessionKind([sess({ type: "STRENGTH", hasStrength: true })], true, th)).toBe("long");
  });
  it("tirada por km o minutos, series, lanzamientos, RPE y fuerza", () => {
    expect(sessionKind([sess({ track: { modality: "RUN", distanceM: 18000, intervals: 0 } })], false, th)).toBe("long");
    expect(sessionKind([sess({ durationSec: 80 * 60, track: { modality: "RUN", distanceM: 10000, intervals: 0 } })], false, th)).toBe("long");
    expect(sessionKind([sess({ track: { modality: "RUN", distanceM: 6000, intervals: 6 } })], false, th)).toBe("high");
    expect(sessionKind([sess({ type: "TECHNICAL", hasTechnical: true })], false, th)).toBe("high");
    expect(sessionKind([sess({ sessionRpe: 8.5 })], false, th)).toBe("high");
    expect(sessionKind([sess({ type: "STRENGTH", hasStrength: true })], false, th)).toBe("strength");
    expect(sessionKind([sess({ track: { modality: "CYCLE", distanceM: 20000, intervals: 0 } })], false, th)).toBe("easy");
  });
});

describe("applyRule", () => {
  it("suma, fija y deriva kcal 4/4/9", () => {
    const r = applyRule(base, rule({ carbsG: 50 }));
    expect(r).toMatchObject({ carbsG: 350, kcal: 2600 });
    expect(applyRule(base, rule({ mode: "set", carbsG: 200, fatG: 60 }))).toMatchObject({ carbsG: 200, fatG: 60, kcal: 2400 - 400 - 90 });
    expect(applyRule(base, rule({ kcal: -300 })).kcal).toBe(2100);
    expect(applyRule(base, rule({ mode: "set", kcal: 3000 })).kcal).toBe(3000);
    expect(applyRule(base, rule({ carbsG: -9999 })).carbsG).toBe(0);
  });
});

describe("resolveDayTarget", () => {
  const rules = { macroRules: { bySession: { strength: rule({ carbsG: 40 }) }, byWeekday: { "2": rule({ kcal: 100 }) } } };
  it("martes 17/11/2026", () => expect(weekdayOf("2026-11-17")).toBe(2));
  it("regla por sesión", () => expect(resolve(rules, "strength")).toMatchObject({ source: "session", goal: { carbsG: 340 } }));
  it("la sesión gana al día de la semana", () => expect(resolve(rules, "strength").source).toBe("session"));
  it("easy sin regla propia cae al día de la semana", () => expect(resolve(rules, "easy")).toMatchObject({ source: "weekday", goal: { kcal: 2500 }, label: "Objetivo del martes" }));
  it("otro día sin regla → base × factor", () => {
    expect(resolve(rules, "easy", "2026-11-18")).toMatchObject({ source: "training-factor", goal: { kcal: 2640 } });
    expect(resolve(rules, "rest", "2026-11-18")).toMatchObject({ source: "base", goal: { kcal: 2400, carbsG: 300 } });
  });
  it("lo marcado a mano prevalece, incluso sin objetivo base", () => {
    const manual = { ...rules, nutritionDayTargets: { "2026-11-17": { kcal: 1800, proteinG: 100, carbsG: 150, fatG: 60 } } };
    expect(resolve(manual, "strength")).toMatchObject({ source: "manual", goal: { kcal: 1800, fiberG: 30 } });
    expect(resolve(manual, "rest", "2026-11-17", null)).toMatchObject({ source: "manual", goal: { kcal: 1800, fiberG: null } });
    expect(resolve(manual, "strength", "2026-11-18").source).toBe("session");
  });
  it("sin base y sin manual no hay objetivo", () => expect(resolve(rules, "strength", "2026-11-17", null).goal).toBeNull());
  it("hidratos antiguos solo si no hay reglas nuevas", () => {
    const legacy = { carbsRestDayG: 200 };
    expect(resolveDayTarget({ base, trained: false, kind: "rest", isoDay: "2026-11-17", prefs: P(legacy), legacyKind: "rest" })).toMatchObject({ source: "legacy-carbs", goal: { carbsG: 200, kcal: 2400 - 400 }, legacyCarbDay: true });
    expect(resolveDayTarget({ base, trained: false, kind: "rest", isoDay: "2026-11-17", prefs: P({ ...legacy, macroRules: { bySession: {}, byWeekday: {} } }), legacyKind: "rest" }).source).toBe("base");
  });
  it("una regla vacía no cuenta", () => expect(resolve({ macroRules: { bySession: { strength: rule({}) }, byWeekday: {} } }, "strength").source).toBe("training-factor"));
});

describe("pruneDayTargets", () => {
  it("quita lo anterior a 90 días", () => {
    const t = { kcal: 1, proteinG: 1, carbsG: 1, fatG: 1 };
    expect(Object.keys(pruneDayTargets({ "2026-01-01": t, "2026-11-01": t }, "2026-11-17"))).toEqual(["2026-11-01"]);
  });
});
