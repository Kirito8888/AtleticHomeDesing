import { describe, expect, it } from "vitest";

import { emptyQuest, type QuestState } from "./quest";
import { hasProgress, mergeQuest, sanitizeQuest } from "./quest-progress";

const a: QuestState = { xp: 100, lv: { t1: { stars: 3, best: 100 }, t2: { stars: 1, best: 60 } }, fails: ["f1"], free: true, seen: true, appeals: [{ q: "q1", sol: "s", ans: "x" }], exams: [{ at: "2027-01-02", nota: 7, theory: 7, practical: 7, total: 10 }] };
const b: QuestState = { xp: 250, lv: { t2: { stars: 2, best: 85 }, t3: { stars: 1 } }, fails: ["f1", "f2"], free: false, appeals: [{ q: "q1", sol: "s", ans: "x" }, { q: "q2", sol: "s", ans: "y" }], exams: [{ at: "2027-01-05", nota: 8, theory: null, practical: 8, total: 10 }] };

describe("mergeQuest", () => {
  it("no pierde nada: lo mejor de cada nivel, unión de fallos, xp máximo", () => {
    const m = mergeQuest(a, b);
    expect(m.xp).toBe(250);
    expect(m.lv).toEqual({ t1: { stars: 3, best: 100 }, t2: { stars: 2, best: 85 }, t3: { stars: 1 } });
    expect(m.fails).toEqual(["f1", "f2"]);
  });
  it("une apelaciones sin duplicar y exámenes por fecha (recientes primero)", () => {
    const m = mergeQuest(a, b);
    expect(m.appeals?.map((x) => x.q)).toEqual(["q1", "q2"]);
    expect(m.exams?.map((x) => x.at)).toEqual(["2027-01-05", "2027-01-02"]);
  });
  it("modo libre y tutorial: manda el primero / basta uno", () => {
    expect(mergeQuest(a, b).free).toBe(true);
    expect(mergeQuest(b, a).free).toBe(false);
    expect(mergeQuest(b, a).seen).toBe(true);
  });
  it("fusionar con una partida vacía es la identidad", () => {
    expect(mergeQuest(a, emptyQuest())).toEqual(a);
    expect(mergeQuest(emptyQuest(), emptyQuest())).toEqual(emptyQuest());
  });
  it("es idempotente", () => {
    const m = mergeQuest(a, b);
    expect(mergeQuest(m, b)).toEqual(m);
  });
});

describe("sanitizeQuest / hasProgress", () => {
  it("sanea basura sin lanzar y acota estrellas", () => {
    expect(sanitizeQuest("hola")).toEqual(emptyQuest());
    expect(sanitizeQuest(null)).toEqual(emptyQuest());
    expect(sanitizeQuest({ xp: -5, lv: { a: { stars: 99, best: 500 } }, fails: [1, "x", "x"] })).toEqual({ xp: 0, lv: { a: { stars: 3, best: 100 } }, fails: ["x"], free: false });
  });
  it("limita las apelaciones a 100 y recorta textos desmesurados", () => {
    const s = sanitizeQuest({ appeals: Array.from({ length: 150 }, (_, i) => ({ q: `q${i}`, sol: "s".repeat(1000), ans: "a" })) });
    expect(s.appeals).toHaveLength(100);
    expect(s.appeals![0].sol).toHaveLength(300);
  });
  it("una partida vacía no cuenta como progreso", () => {
    expect(hasProgress(emptyQuest())).toBe(false);
    expect(hasProgress({ ...emptyQuest(), fails: ["x"] })).toBe(true);
  });
});
