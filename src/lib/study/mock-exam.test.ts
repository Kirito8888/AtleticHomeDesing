import { describe, expect, it } from "vitest";

import { examScore, pickRandom } from "@/lib/study/mock-exam";

describe("examen simulado", () => {
  it("elige sin repetir y no más de las que hay", () => {
    const p = pickRandom([1, 2, 3, 4, 5, 6], 4);
    expect(new Set(p).size).toBe(4);
    expect(pickRandom([1, 2], 10)).toHaveLength(2);
  });
  it("es determinista con el mismo azar", () => {
    const r = () => 0;
    expect(pickRandom(["a", "b", "c"], 2, r)).toEqual(["a", "b"]);
  });
  it("nota sobre 10", () => {
    expect(examScore(7, 10)).toEqual({ score: 7, passed: true });
    expect(examScore(2, 6)).toEqual({ score: 3.3, passed: false });
    expect(examScore(0, 0)).toEqual({ score: 0, passed: false });
  });
});
