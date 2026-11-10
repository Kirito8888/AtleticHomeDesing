// v2.9 · Histórico de autoevaluación y micro-pasos: validación y conversión de lo que había en localStorage.
import { describe, expect, it } from "vitest";

import { attemptFromLegacy, isMicroFinished, legacyMicroKey, microSessionFromSaved, microSessionSchema, selfTestAttemptSchema, selfTestKey, type SavedMicro } from "@/lib/study/study-history";

const steps = { title: "Tema 1", steps: [1, 2, 3].map((n) => ({ n, action: `Paso ${n}`, minutes: 10 })) };
const saved = (over: Partial<SavedMicro> = {}): SavedMicro => ({ steps, preset: "15/3", done: [0, 1, 2], ...over });

describe("autoevaluación", () => {
  it("clave local estable por asignatura", () => expect(selfTestKey("m1")).toBe("atlenza.study.selfTest.m1"));
  it("convierte lo guardado en localStorage en un intento importado sin perder nada", () => {
    const at = "2026-11-01T10:00:00.000Z";
    const a = attemptFromLegacy({ score: 6.5, label: "Aprobado justo", weak: ["Redes", "TCP"], at });
    expect(a).toMatchObject({ score: 6.5, label: "Aprobado justo", weak: ["Redes", "TCP"], imported: true });
    expect(a?.takenAt.toISOString()).toBe(at);
    expect(a?.answers ?? null).toBeNull();
  });
  it("descarta basura: sin fecha, nota fuera de rango o no objeto", () => {
    expect(attemptFromLegacy(null)).toBeNull();
    expect(attemptFromLegacy("x")).toBeNull();
    expect(attemptFromLegacy({ score: 11, label: "x", weak: [], at: "2026-11-01T10:00:00Z" })).toBeNull();
    expect(attemptFromLegacy({ score: 5, label: "x", weak: [], at: "no-es-fecha" })).toBeNull();
  });
  it("rechaza fechas futuras y respuestas con puntuación inválida", () => {
    const base = { score: 5, label: "x", weak: [] };
    expect(selfTestAttemptSchema.safeParse({ ...base, takenAt: new Date(Date.now() + 5 * 86_400_000) }).success).toBe(false);
    expect(selfTestAttemptSchema.safeParse({ ...base, takenAt: new Date(), answers: [{ topic: "a", tag: "red", score: 0.7 }] }).success).toBe(false);
    expect(selfTestAttemptSchema.safeParse({ ...base, takenAt: new Date(), answers: [{ topic: "a", tag: "red", score: 0.5 }] }).success).toBe(true);
  });
});

describe("micro-pasos", () => {
  it("una sesión a medias NO es histórico", () => {
    expect(isMicroFinished(saved({ done: [0, 1] }))).toBe(false);
    expect(microSessionFromSaved(saved({ done: [0, 1] }))).toBeNull();
  });
  it("una terminada sin key es importada; con key es propia", () => {
    const old = microSessionFromSaved(saved(), 1_700_000_000_000);
    expect(old).toMatchObject({ stepsDone: 3, focusMin: 15, restMin: 3, imported: true });
    expect(old?.clientKey).toMatch(/^legacy:/);
    expect(microSessionFromSaved(saved({ key: "abc" }))).toMatchObject({ clientKey: "abc", imported: false });
  });
  it("la clave legacy es estable y no depende del orden de done", () => {
    expect(legacyMicroKey(saved())).toBe(legacyMicroKey(saved({ done: [2, 0, 1] })));
    expect(legacyMicroKey(saved())).not.toBe(legacyMicroKey(saved({ steps: { ...steps, title: "Otro" } })));
  });
  it("ya sincronizada → no se vuelve a ofrecer", () => {
    expect(microSessionFromSaved(saved({ key: "abc", syncedKey: "abc" }))).toBeNull();
    expect(microSessionFromSaved(saved({ syncedKey: legacyMicroKey(saved()) }))).toBeNull();
  });
  it("acota el preset guardado", () => {
    expect(microSessionFromSaved(saved({ preset: "999/0", key: "k" }))).toMatchObject({ focusMin: 30, restMin: 3 });
  });
  it("el esquema exige pasos y no admite más hechos que pasos", () => {
    const ok = { clientKey: "k", title: "t", steps: [{ n: 1, action: "a", minutes: 5 }], stepsDone: 1, focusMin: 10, restMin: 2, completedAt: new Date() };
    expect(microSessionSchema.safeParse(ok).success).toBe(true);
    expect(microSessionSchema.safeParse({ ...ok, stepsDone: 2 }).success).toBe(false);
    expect(microSessionSchema.safeParse({ ...ok, steps: [] }).success).toBe(false);
  });
});
