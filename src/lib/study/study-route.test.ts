import { describe, expect, it } from "vitest";

import { daysLeft, prioritize, type RouteTopic } from "./study-route";

const t = (id: string, tag: RouteTopic["tag"], minutes: number, done = false): RouteTopic => ({ id, name: id, tag, minutes, done });
const ids = (r: { id: string }[]) => r.map((x) => x.id);

describe("daysLeft", () => {
  it("cuenta días naturales", () => {
    expect(daysLeft("2026-10-25", "2026-10-26")).toBe(1);
    expect(daysLeft("2026-10-25", "2026-11-24")).toBe(30);
    expect(daysLeft("2026-10-25", "2026-10-25")).toBe(0);
    expect(daysLeft("2026-10-25", "2026-10-20")).toBe(-5);
    expect(daysLeft("2026-10-25", null)).toBeNull();
  });
});

describe("prioritize", () => {
  const topics = [t("grey-corto", "grey", 20), t("rojo-largo", "red", 120), t("amarillo", "yellow", 60), t("rojo-corto", "red", 30)];

  it("30 días: cabe todo → por nivel y, dentro, nota/minuto", () => {
    const r = prioritize({ topics, daysLeft: 30, dailyMin: 180 });
    expect(ids(r)).toEqual(["rojo-corto", "rojo-largo", "amarillo", "grey-corto"]);
    expect(r.every((x) => !x.overflow)).toBe(true);
    expect(r[0].day).toBe(1);
  });

  it("1 día: no cabe → voraz por nota/minuto, marca lo que no llega y no pierde temas", () => {
    const r = prioritize({ topics, daysLeft: 1, dailyMin: 100 });
    // puntuaciones: rojo-corto .1, grey-corto .05, amarillo .033, rojo-largo .025
    expect(ids(r)).toEqual(["rojo-corto", "grey-corto", "amarillo", "rojo-largo"]);
    expect(r.map((x) => x.overflow)).toEqual([false, false, true, true]);
    expect(r).toHaveLength(topics.length);
  });

  it("los hechos van al final y no cuentan para el tiempo", () => {
    const r = prioritize({ topics: [t("a", "grey", 30, true), t("b", "red", 30)], daysLeft: 1, dailyMin: 30 });
    expect(ids(r)).toEqual(["b", "a"]);
    expect(r[0].overflow).toBe(false);
    expect(r[1].day).toBeNull();
    expect(r.map((x) => x.order)).toEqual([1, 2]);
  });

  it("sin fecha no hay límite; fecha pasada = un solo día", () => {
    expect(prioritize({ topics, daysLeft: null, dailyMin: 60 }).some((x) => x.overflow)).toBe(false);
    expect(prioritize({ topics, daysLeft: -3, dailyMin: 60 }).some((x) => x.overflow)).toBe(true);
  });

  it("reparte en días y desempata por el orden original", () => {
    const r = prioritize({ topics: [t("x", "red", 60), t("y", "red", 60), t("z", "red", 60)], daysLeft: 30, dailyMin: 60 });
    expect(ids(r)).toEqual(["x", "y", "z"]);
    expect(r.map((v) => v.day)).toEqual([1, 2, 3]);
  });
});
