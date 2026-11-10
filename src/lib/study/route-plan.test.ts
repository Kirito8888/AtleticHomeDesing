import { describe, expect, it } from "vitest";

import { acceptRoutePlanSchema, planDays, routeToBlocks } from "./route-plan";
import { prioritize, type RouteTopic } from "./study-route";

const t = (id: string, minutes: number, tag: RouteTopic["tag"] = "yellow", done = false): RouteTopic => ({ id, name: `Tema ${id}`, tag, minutes, done });

describe("planDays", () => {
  it("de hoy a la víspera del examen", () => {
    expect(planDays("2026-11-10", "2026-11-13")).toEqual(["2026-11-10", "2026-11-11", "2026-11-12"]);
  });
  it("examen hoy o pasado: ningún día", () => {
    expect(planDays("2026-11-10", "2026-11-10")).toEqual([]);
    expect(planDays("2026-11-10", "2026-11-01")).toEqual([]);
  });
  it("sin fecha: horizonte", () => {
    expect(planDays("2026-11-10", null, 3)).toEqual(["2026-11-10", "2026-11-11", "2026-11-12"]);
    expect(planDays("2026-11-10", null)).toHaveLength(28);
  });
});

describe("routeToBlocks", () => {
  const days = ["2026-11-10", "2026-11-11", "2026-11-12"];

  it("respeta el orden de la ruta y la capacidad de cada día", () => {
    const route = prioritize({ topics: [t("a", 60, "grey"), t("b", 60, "red"), t("c", 30, "yellow")], daysLeft: 3, dailyMin: 90 });
    const r = routeToBlocks({ route, days, capacity: () => 90, blockMin: 30 });
    expect(r.blocks.map((b) => [b.topicId, b.date, b.minutes])).toEqual([
      ["b", "2026-11-10", 60],
      ["c", "2026-11-10", 30],
      ["a", "2026-11-11", 60],
    ]);
    expect(r.unscheduled).toEqual([]);
  });

  it("parte un tema largo entre días y no usa huecos menores que el tramo mínimo", () => {
    const route = prioritize({ topics: [t("a", 100)], daysLeft: 3, dailyMin: 60 });
    const cap: Record<string, number> = { "2026-11-10": 20, "2026-11-11": 60, "2026-11-12": 60 };
    const r = routeToBlocks({ route, days, capacity: (d) => cap[d], blockMin: 30 });
    expect(r.blocks.map((b) => [b.date, b.minutes])).toEqual([
      ["2026-11-11", 60],
      ["2026-11-12", 40],
    ]);
  });

  it("lo que no cabe va a unscheduled y los hechos no se planifican", () => {
    const route = prioritize({ topics: [t("a", 120, "red"), t("b", 60, "red", true), t("c", 90)], daysLeft: 2, dailyMin: 60 });
    const r = routeToBlocks({ route, days: days.slice(0, 2), capacity: () => 60, blockMin: 30 });
    expect(r.blocks.every((b) => b.topicId !== "b")).toBe(true);
    expect(r.blocks.reduce((a, b) => a + b.minutes, 0)).toBe(120);
    expect(r.unscheduled.map((u) => [u.topicId, u.minutes])).toEqual([["c", 90]]);
  });

  it("capacidad 0 (día lleno de entrenos y otros bloques) se salta", () => {
    const route = prioritize({ topics: [t("a", 30)], daysLeft: 3, dailyMin: 60 });
    const r = routeToBlocks({ route, days, capacity: (d) => (d === "2026-11-10" ? 0 : 60), blockMin: 30 });
    expect(r.blocks).toEqual([{ topicId: "a", topic: "Tema a", date: "2026-11-11", minutes: 30 }]);
  });
});

describe("acceptRoutePlanSchema", () => {
  it("valida minutos, fechas y tamaño", () => {
    expect(acceptRoutePlanSchema.safeParse({ blocks: [{ topicId: "x", date: "2026-11-10", minutes: 30 }] }).success).toBe(true);
    expect(acceptRoutePlanSchema.safeParse({ blocks: [] }).success).toBe(false);
    expect(acceptRoutePlanSchema.safeParse({ blocks: [{ topicId: "x", date: "10/11/2026", minutes: 30 }] }).success).toBe(false);
    expect(acceptRoutePlanSchema.safeParse({ blocks: [{ topicId: "x", date: "2026-11-10", minutes: 2 }] }).success).toBe(false);
  });
});
