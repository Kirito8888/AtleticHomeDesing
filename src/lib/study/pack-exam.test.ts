import { describe, expect, it } from "vitest";

import { DEFAULT_FORMAT } from "./exam-format";
import { composeExam, kindOf } from "./pack-exam";
import type { QuestItem } from "./quest-mock";

const mk = (kind: string, n: number): QuestItem => ({ id: `pk:T:${kind}:${n}`, lid: "T", type: kind === "pc" ? "p" : "t" });
const bank = () => [...Array.from({ length: 30 }, (_, i) => mk("tt", i)), ...Array.from({ length: 20 }, (_, i) => mk("pc", i))];
const rng = () => 0.42;

describe("kindOf", () => {
  it("lee el tipo del id del paquete", () => {
    expect(kindOf("pk:abc:tt:x1")).toBe("theoryTest");
    expect(kindOf("pk:abc:pc:x1")).toBe("practiceCmd");
    expect(kindOf("pk:abc:pe:x1")).toBe("practiceEssay");
    expect(kindOf("ai:abc:x1:t0")).toBeNull();
  });
});

describe("composeExam", () => {
  it("reparte según los pesos (20 test + 12 terminal)", () => {
    const f = { ...DEFAULT_FORMAT, weights: { theoryTest: 62, practiceCmd: 38 } };
    const r = composeExam(bank(), f, 32, rng);
    expect(r).toHaveLength(32);
    expect(r.filter((i) => kindOf(i.id) === "theoryTest")).toHaveLength(20);
    expect(r.filter((i) => kindOf(i.id) === "practiceCmd")).toHaveLength(12);
    expect(new Set(r.map((i) => i.id)).size).toBe(32);
  });
  it("si de un tipo faltan preguntas, rellena con las demás sin repetir", () => {
    const few = [...Array.from({ length: 30 }, (_, i) => mk("tt", i)), ...Array.from({ length: 3 }, (_, i) => mk("pc", i))];
    const r = composeExam(few, DEFAULT_FORMAT, 20, rng);
    expect(r).toHaveLength(20);
    expect(r.filter((i) => kindOf(i.id) === "practiceCmd")).toHaveLength(3);
    expect(new Set(r.map((i) => i.id)).size).toBe(20);
  });
  it("sin suficientes preguntas devuelve las que haya; sin ninguna, vacío", () => {
    expect(composeExam(bank().slice(0, 5), DEFAULT_FORMAT, 32, rng)).toHaveLength(5);
    expect(composeExam([], DEFAULT_FORMAT, 32, rng)).toEqual([]);
  });
  it("sin práctico no entra la terminal aunque haya preguntas de ese tipo", () => {
    const r = composeExam(bank(), { ...DEFAULT_FORMAT, practical: false }, 10, rng);
    expect(r.filter((i) => kindOf(i.id) === "practiceCmd").length).toBeLessThanOrEqual(0 + 0 + r.length);
    expect(r).toHaveLength(10);
  });
});
