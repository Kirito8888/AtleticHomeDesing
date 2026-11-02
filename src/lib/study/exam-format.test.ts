import { describe, expect, it } from "vitest";

import { activeKinds, allocate, bossQuestions, DEFAULT_FORMAT, examFormatSchema, parseFormat } from "./exam-format";

const base = { theory: true, practical: false, test: true, essay: false, minutes: 35, questions: 32 };
const sum = (o: Record<string, number | undefined>) => Object.values(o).reduce<number>((a, b) => a + (b ?? 0), 0);

describe("examFormatSchema", () => {
  it("exige teórico o práctico", () => {
    expect(examFormatSchema.safeParse({ ...base, theory: false }).success).toBe(false);
  });
  it("teoría sin test ni desarrollo no vale; práctico solo sí (terminal)", () => {
    expect(examFormatSchema.safeParse({ ...base, test: false }).success).toBe(false);
    expect(examFormatSchema.safeParse({ ...base, theory: false, practical: true, test: false }).success).toBe(true);
  });
  it("los pesos de los tipos activos deben sumar 100", () => {
    const f = { ...base, practical: true };
    expect(examFormatSchema.safeParse({ ...f, weights: { theoryTest: 60, practiceCmd: 30 } }).success).toBe(false);
    expect(examFormatSchema.safeParse({ ...f, weights: { theoryTest: 60, practiceCmd: 40 } }).success).toBe(true);
  });
  it("rellena minutos y preguntas por defecto y acota rangos", () => {
    const r = examFormatSchema.parse({ theory: true, practical: false, test: true, essay: false });
    expect(r.minutes).toBe(35);
    expect(r.questions).toBe(32);
    expect(examFormatSchema.safeParse({ ...base, minutes: 1 }).success).toBe(false);
    expect(examFormatSchema.safeParse({ ...base, questions: 500 }).success).toBe(false);
  });
});

describe("activeKinds", () => {
  it("combina contenido y forma", () => {
    expect(activeKinds({ theory: true, practical: true, test: true, essay: true })).toEqual(["theoryTest", "theoryEssay", "practiceCmd"]);
    expect(activeKinds({ theory: true, practical: true, test: true, essay: true, weights: { practiceTest: 10, practiceEssay: 10 } })).toEqual(["theoryTest", "theoryEssay", "practiceCmd", "practiceTest", "practiceEssay"]);
    expect(activeKinds({ theory: false, practical: true, test: true, essay: true })).toEqual(["practiceCmd", "practiceTest", "practiceEssay"]);
    expect(activeKinds({ theory: true, practical: false, test: false, essay: true })).toEqual(["theoryEssay"]);
    expect(activeKinds({ theory: false, practical: true, test: false, essay: false })).toEqual(["practiceCmd"]);
  });
});

describe("allocate", () => {
  it("el formato por defecto reparte 32 entre test teórico y terminal", () => {
    const a = allocate(DEFAULT_FORMAT, 32);
    expect(sum(a)).toBe(32);
    expect(Object.keys(a)).toEqual(["theoryTest", "practiceCmd"]);
  });
  it("respeta los pesos (20/12 → 62,5 %/37,5 %)", () => {
    expect(allocate({ ...DEFAULT_FORMAT, weights: { theoryTest: 62, practiceCmd: 38 } }, 32)).toEqual({ theoryTest: 20, practiceCmd: 12 });
  });
  it("siempre suma el total y no deja a cero un tipo con peso", () => {
    const f = { ...DEFAULT_FORMAT, essay: true, weights: { theoryTest: 50, theoryEssay: 30, practiceCmd: 15, practiceTest: 5, practiceEssay: 0 } };
    for (const n of [4, 7, 10, 13, 32, 80]) {
      const a = allocate(f, n);
      expect(sum(a)).toBe(n);
      expect(a.practiceEssay).toBeUndefined();
    }
    expect(allocate(f, 10).practiceTest).toBeGreaterThanOrEqual(1);
  });
  it("sin práctico no hay terminal", () => {
    expect(allocate({ ...DEFAULT_FORMAT, practical: false }, 10)).toEqual({ theoryTest: 10 });
  });
  it("sin tipos activos o sin total devuelve vacío", () => {
    expect(allocate(DEFAULT_FORMAT, 0)).toEqual({});
  });
});

describe("parseFormat / bossQuestions", () => {
  it("lo inválido cae al formato por defecto", () => {
    expect(parseFormat(null)).toEqual(DEFAULT_FORMAT);
    expect(parseFormat({ theory: false })).toEqual(DEFAULT_FORMAT);
  });
  it("el Jefe es ~60 % del examen con mínimo 4", () => {
    expect(bossQuestions(DEFAULT_FORMAT)).toBe(19);
    expect(bossQuestions({ ...DEFAULT_FORMAT, questions: 4 })).toBe(4);
  });
});
