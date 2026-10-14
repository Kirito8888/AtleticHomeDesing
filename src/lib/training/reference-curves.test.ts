import { describe, expect, it } from "vitest";

import { ageAt, curveInputSchema, interpolate, overlay, parsePointsText, summarizeOverlay } from "./reference-curves";

const pts = [
  { x: 14, p50: 40, low: 36, high: 44 },
  { x: 16, p50: 48, low: 42, high: 54 },
];
const base = { testKey: "cmj", unit: "cm", higherIsBetter: true, title: "CMJ por edad", study: "Estudio de prueba", authors: "Autora A", year: 2020, citation: "Autora A (2020). Estudio de prueba. Revista de prueba.", points: pts };

describe("interpolate", () => {
  it("interpola linealmente y no extrapola", () => {
    expect(interpolate(pts, 15)).toEqual({ p50: 44, low: 39, high: 49 });
    expect(interpolate(pts, 14)?.p50).toBe(40);
    expect(interpolate(pts, 16)?.p50).toBe(48);
    expect(interpolate(pts, 13.9)).toBeNull();
    expect(interpolate(pts, 16.1)).toBeNull();
  });
  it("sin banda devuelve null en low/high", () => {
    expect(interpolate([{ x: 10, p50: 1 }, { x: 12, p50: 3 }], 11)).toEqual({ p50: 2, low: null, high: null });
  });
});

describe("ageAt", () => {
  it("365,25 días por año", () => {
    expect(ageAt("2010-01-01", "2025-01-01")).toBeCloseTo(15, 2);
  });
});

describe("overlay", () => {
  // nacida el 01-01-2010: el 2025-01-01 tiene ~15 años → ref 44 (banda 39–49)
  const curve = { points: pts, higherIsBetter: true };
  it("delta y banda con valores conocidos", () => {
    const [r] = overlay([{ date: "2025-01-01", value: 46 }], curve, "2010-01-01");
    expect(r.ref).toBeCloseTo(44, 1);
    expect(r.deltaPct).toBeCloseTo(4.55, 1);
    expect(r.band).toBe("within");
  });
  it("por encima, por debajo y fuera de rango", () => {
    const rows = overlay([{ date: "2025-01-01", value: 52 }, { date: "2025-01-01", value: 30 }, { date: "2030-01-01", value: 60 }], curve, "2010-01-01");
    expect(rows.map((r) => r.band)).toEqual(["above", "below", "outside"]);
    expect(rows[2].deltaPct).toBeNull();
  });
  it("en tiempos (menor es mejor) el signo se invierte", () => {
    const t = { points: [{ x: 14, p50: 8, low: 7.5, high: 8.5 }, { x: 16, p50: 7.6, low: 7.1, high: 8.1 }], higherIsBetter: false };
    const [fast, slow] = overlay([{ date: "2025-01-01", value: 7.0 }, { date: "2025-01-01", value: 8.4 }], t, "2010-01-01");
    expect(fast.deltaPct).toBeGreaterThan(0);
    expect(fast.band).toBe("above");
    expect(slow.deltaPct).toBeLessThan(0);
    expect(slow.band).toBe("below");
  });
  it("resumen", () => {
    const s = summarizeOverlay(overlay([{ date: "2024-06-01", value: 44 }, { date: "2025-01-01", value: 46 }, { date: "2035-01-01", value: 1 }], { points: pts, higherIsBetter: true }, "2010-01-01"));
    expect(s.comparable).toBe(2);
    expect(s.outside).toBe(1);
    expect(s.last?.value).toBe(46);
  });
});

describe("parsePointsText y esquema", () => {
  it("lee líneas con coma decimal y columnas opcionales", () => {
    expect(parsePointsText("14;40,5;36;44\n16;48")).toEqual([{ x: 14, p50: 40.5, low: 36, high: 44 }, { x: 16, p50: 48 }]);
    expect(() => parsePointsText("14;abc")).toThrow(/Línea 1/);
  });
  it("exige atribución y puntos coherentes", () => {
    expect(curveInputSchema.safeParse(base).success).toBe(true);
    expect(curveInputSchema.safeParse({ ...base, citation: "" }).success).toBe(false);
    expect(curveInputSchema.safeParse({ ...base, authors: "" }).success).toBe(false);
    expect(curveInputSchema.safeParse({ ...base, year: undefined }).success).toBe(false);
    expect(curveInputSchema.safeParse({ ...base, doi: "no-es-doi" }).success).toBe(false);
    expect(curveInputSchema.safeParse({ ...base, doi: "10.1234/abc.5" }).success).toBe(true);
    expect(curveInputSchema.safeParse({ ...base, doi: "" }).success).toBe(true);
    expect(curveInputSchema.safeParse({ ...base, sourceUrl: "http://x.org" }).success).toBe(false);
    expect(curveInputSchema.safeParse({ ...base, points: [pts[1], pts[0]] }).success).toBe(false);
    expect(curveInputSchema.safeParse({ ...base, points: [{ x: 14, p50: 40, low: 41 }, pts[1]] }).success).toBe(false);
    expect(curveInputSchema.safeParse({ ...base, points: [pts[0]] }).success).toBe(false);
  });
});
