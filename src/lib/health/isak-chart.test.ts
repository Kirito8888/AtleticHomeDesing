import { describe, expect, it } from "vitest";

import { computeIsak, type IsakInput } from "./isak";
import { type CompositionPoint, DOMAIN, evolutionSeries, massDeltas, somatochartOutline, somatoXY, toSvg, trajectory, VERTICES, VIEW } from "./isak-chart";

const base: IsakInput = {
  date: "2026-11-09", sex: "M", weightKg: 75, heightCm: 178,
  triceps: 10, subscapular: 9, biceps: 5, iliacCrest: 12, supraspinale: 7, abdominal: 12, frontThigh: 11, medialCalf: 6,
  armFlexedGirth: 33.5, calfGirth: 37, humerusBreadth: 7, femurBreadth: 9.8, wristBreadth: 5.7,
};
const point = (id: string, input: IsakInput): CompositionPoint => {
  const r = computeIsak(input);
  return { id, date: input.date, weightKg: input.weightKg, somatotype: r.somatotype, masses: r.masses };
};

describe("coordenadas de la somatocarta", () => {
  it("X = ecto − endo · Y = 2·meso − (endo + ecto)", () => {
    expect(somatoXY(2.49, 5.05, 2.32)).toEqual({ x: -0.17, y: 5.29 });
    expect(somatoXY(3, 3, 3)).toEqual({ x: 0, y: 0 });
    expect(somatoXY(4, 4, 4)).toEqual({ x: 0, y: 0 });
  });
  it("vértices canónicos 7-1-1, 1-7-1 y 1-1-7", () => {
    expect(VERTICES.endo).toEqual({ x: -6, y: -6 });
    expect(VERTICES.meso).toEqual({ x: 0, y: 12 });
    expect(VERTICES.ecto).toEqual({ x: 6, y: -6 });
  });
  it("coincide con el X/Y que calcula Heath-Carter", () => {
    const s = computeIsak(base).somatotype;
    const p = somatoXY(s.endo, s.meso, s.ecto);
    expect(p.x).toBeCloseTo(s.x, 1);
    expect(p.y).toBeCloseTo(s.y, 1);
  });
});

describe("paso al SVG", () => {
  it("el origen cae centrado en X y la Y crece hacia arriba", () => {
    const o = toSvg({ x: 0, y: 0 });
    expect(o.cx).toBeCloseTo(VIEW / 2, 5);
    expect(toSvg(VERTICES.meso).cy).toBeLessThan(o.cy);
    expect(toSvg(VERTICES.endo).cx).toBeLessThan(o.cx);
    expect(toSvg(VERTICES.ecto).cx).toBeGreaterThan(o.cx);
  });
  it("todo cabe en el viewBox y lo de fuera se recorta avisando", () => {
    for (const v of Object.values(VERTICES)) {
      const p = toSvg(v);
      expect(p.clamped).toBe(false);
      expect(p.cx).toBeGreaterThan(0);
      expect(p.cx).toBeLessThan(VIEW);
      expect(p.cy).toBeGreaterThan(0);
      expect(p.cy).toBeLessThan(VIEW);
    }
    const far = toSvg({ x: 20, y: -30 });
    expect(far.clamped).toBe(true);
    const edge = toSvg({ x: DOMAIN.xMax, y: DOMAIN.yMin });
    expect([far.cx, far.cy]).toEqual([edge.cx, edge.cy]);
  });
  it("contorno cerrado con tres curvas y tres ejes", () => {
    const { outline, axes } = somatochartOutline();
    expect(outline.match(/Q/g)).toHaveLength(3);
    expect(outline.endsWith("Z")).toBe(true);
    expect(axes).toHaveLength(3);
  });
});

describe("series", () => {
  const a = point("a", base);
  const b = point("b", { ...base, date: "2026-12-09", weightKg: 77, triceps: 8, abdominal: 10 });
  it("trayectoria en orden cronológico aunque llegue desordenada", () => {
    const t = trajectory([b, a]);
    expect(t.map((p) => p.id)).toEqual(["a", "b"]);
    expect(t[0].x).toBeCloseTo(a.somatotype.x, 1);
  });
  it("deltas de las 4 masas frente a la previa (null sin previa)", () => {
    const d = massDeltas(b.masses, a.masses);
    expect(d.fat?.kg).toBeCloseTo(b.masses.fat.kg - a.masses.fat.kg, 2);
    expect(d.muscle?.pct).toBeCloseTo(b.masses.muscle.pct - a.masses.muscle.pct, 2);
    expect(Object.values(massDeltas(a.masses)).every((x) => x === null)).toBe(true);
  });
  it("evolución de peso, grasa y músculo en kg y %", () => {
    const e = evolutionSeries([b, a]);
    expect(e.map((r) => r.date)).toEqual(["2026-11-09", "2026-12-09"]);
    expect(e[1].weightKg).toBe(77);
    expect(e[0].fatKg).toBeCloseTo(a.masses.fat.kg, 2);
    expect(e[0].musclePct).toBeCloseTo(a.masses.muscle.pct, 2);
  });
});
