import { describe, expect, it } from "vitest";

import { type FeedbackDay, proposeWeekChanges, weekVersion } from "./feedback";

const content = [
  { kind: "table", title: "Fuerza", rows: [{ exercise: "Sentadilla", sets: "4 × 6", load: "", rir: "", rest: "", how: "" }] },
];
const day = (id: string, over: Partial<FeedbackDay> = {}): FeedbackDay => ({
  id,
  code: `S2-${id}`,
  title: "Fuerza A",
  date: new Date("2027-03-08T00:00:00Z"),
  content,
  mode: null,
  light: { durationMin: 30, blocks: [] },
  sessionId: null,
  updatedAt: new Date("2027-03-01T10:00:00Z"),
  ...over,
});

describe("proposeWeekChanges", () => {
  it("HARD quita una serie y muestra antes/después sin mutar la entrada", () => {
    const days = [day("a")];
    const before = JSON.stringify(days);
    const p = proposeWeekChanges(days, new Set(), "HARD", null);
    expect(p.days).toHaveLength(1);
    expect(p.days[0].rows).toEqual([{ exercise: "Sentadilla", before: "4 × 6", after: "3 × 6" }]);
    expect(p.days[0].toLight).toBe(false);
    expect(JSON.stringify(days)).toBe(before);
  });

  it("EASY añade una serie; OK no propone nada", () => {
    expect(proposeWeekChanges([day("a")], new Set(), "EASY", null).days[0].rows[0].after).toBe("5 × 6");
    expect(proposeWeekChanges([day("a")], new Set(), "OK", null).days).toHaveLength(0);
  });

  it("dolor ≥ 4 pasa a versión suave solo si el día la tiene; dolor 3 no", () => {
    expect(proposeWeekChanges([day("a")], new Set(), "OK", 4).days[0]).toMatchObject({ toLight: true, mode: "LIGHT" });
    expect(proposeWeekChanges([day("a", { light: null })], new Set(), "OK", 8).days).toHaveLength(0);
    expect(proposeWeekChanges([day("a")], new Set(), "OK", 3).days).toHaveLength(0);
  });

  it("los días ya hechos no se tocan", () => {
    const p = proposeWeekChanges([day("a", { sessionId: "s1" }), day("b")], new Set(["s1"]), "HARD", null);
    expect(p.days.map((d) => d.dayId)).toEqual(["b"]);
  });

  it("la versión cambia si cambia el día, su modo o si se hace una sesión", () => {
    const base = weekVersion([day("a", { sessionId: "s1" })], new Set());
    expect(weekVersion([day("a", { sessionId: "s1" })], new Set())).toBe(base);
    expect(weekVersion([day("a", { sessionId: "s1", updatedAt: new Date("2027-03-02T00:00:00Z") })], new Set())).not.toBe(base);
    expect(weekVersion([day("a", { sessionId: "s1", mode: "LIGHT" })], new Set())).not.toBe(base);
    expect(weekVersion([day("a", { sessionId: "s1" })], new Set(["s1"]))).not.toBe(base);
  });
});
