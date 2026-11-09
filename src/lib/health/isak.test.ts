import { describe, expect, it } from "vitest";

import { computeIsak, type IsakInput, isakInputSchema, parseIsakFile, somatotypeLabel } from "./isak";

// Fixture calculado paso a paso, de forma independiente, con las fórmulas publicadas:
// X = 26 · 170,18 / 178 = 24,858 → endo 2,49 · meso 5,05 · HWR 42,208 → ecto 2,32
// Faulkner Σ4 = 38 → 11,6 % · Rocha ósea 12,17 kg · Würch H 24,1 % = 18,08 kg · músculo = resto.
const base: IsakInput = {
  date: "2026-11-09", sex: "M", weightKg: 75, heightCm: 178,
  triceps: 10, subscapular: 9, biceps: 5, iliacCrest: 12, supraspinale: 7, abdominal: 12, frontThigh: 11, medialCalf: 6,
  armFlexedGirth: 33.5, calfGirth: 37, humerusBreadth: 7, femurBreadth: 9.8, wristBreadth: 5.7,
};

describe("Heath-Carter y 4 masas", () => {
  const r = computeIsak(base);
  it("somatotipo del fixture", () => {
    expect(r.somatotype.endo).toBeCloseTo(2.49, 1);
    expect(r.somatotype.meso).toBeCloseTo(5.05, 1);
    expect(r.somatotype.ecto).toBeCloseTo(2.32, 1);
    expect(r.somatotype.hwr).toBeCloseTo(42.21, 1);
    expect(r.somatotype.x).toBeCloseTo(r.somatotype.ecto - r.somatotype.endo, 1);
    expect(r.somatotype.y).toBeCloseTo(2 * 5.05 - (2.49 + 2.32), 1);
    expect(r.somatotype.label).toBe("mesomorfo");
  });
  it("masas en kg y %", () => {
    expect(r.masses.fat.kg).toBeCloseTo(8.7, 1);
    expect(r.masses.bone.kg).toBeCloseTo(12.17, 1);
    expect(r.masses.residual.kg).toBeCloseTo(18.08, 1);
    expect(r.masses.muscle.kg).toBeCloseTo(36.06, 1);
    expect(r.masses.fat.pct).toBeCloseTo(11.6, 1);
  });
  it("las cuatro masas suman el peso y el 100 %", () => {
    const m = Object.values(r.masses);
    expect(m.reduce((a, x) => a + x.kg, 0)).toBeCloseTo(75, 1);
    expect(m.reduce((a, x) => a + x.pct, 0)).toBeCloseTo(100, 0);
  });
  it("sumas, IMC y método", () => {
    expect(r.sum8).toBe(72);
    expect(r.sum6).toBe(10 + 9 + 7 + 12 + 11 + 6);
    expect(r.bmi).toBeCloseTo(23.67, 1);
    expect(r.method).toBe("heath-carter-1990+de-rose");
  });
  it("ramas de la ectomorfia", () => {
    // HWR ≤ 38,25 → 0,1 (peso alto); intermedio → 0,463·HWR − 17,63
    expect(computeIsak({ ...base, weightKg: 110 }).somatotype.ecto).toBe(0.1);
    const mid = computeIsak({ ...base, heightCm: 178, weightKg: 80 }).somatotype; // HWR 41,3 → rama alta
    expect(mid.ecto).toBeCloseTo(0.732 * mid.hwr - 28.58, 1);
    const inter = computeIsak({ ...base, weightKg: 92 }).somatotype; // HWR 39,4
    expect(inter.hwr).toBeGreaterThan(38.25);
    expect(inter.hwr).toBeLessThan(40.75);
    expect(inter.ecto).toBeCloseTo(0.463 * inter.hwr - 17.63, 1);
  });
  it("suelo de 0,1 en mesomorfia", () => {
    const low = computeIsak({ ...base, humerusBreadth: 5, femurBreadth: 7, armFlexedGirth: 20, calfGirth: 20, heightCm: 220, weightKg: 60 });
    expect(low.somatotype.meso).toBe(0.1);
  });
  it("avisa si la masa muscular sale ≤ 0", () => {
    const bad = computeIsak({ ...base, triceps: 60, subscapular: 60, supraspinale: 60, abdominal: 60, weightKg: 30 });
    expect(bad.warnings.length).toBeGreaterThan(0);
  });
  it("mujer usa el 20,9 % residual", () => {
    expect(computeIsak({ ...base, sex: "F" }).masses.residual.pct).toBeCloseTo(20.9, 1);
  });
  it("etiquetas", () => {
    expect(somatotypeLabel(4, 4, 4)).toBe("central");
    expect(somatotypeLabel(5, 5.2, 1)).toBe("endo-mesomorfo");
    expect(somatotypeLabel(2, 6, 1)).toBe("mesomorfo");
  });
});

describe("rangos fisiológicos", () => {
  it("rechaza fuera de rango y acepta el fixture", () => {
    expect(isakInputSchema.safeParse(base).success).toBe(true);
    expect(isakInputSchema.safeParse({ ...base, weightKg: 10 }).success).toBe(false);
    expect(isakInputSchema.safeParse({ ...base, triceps: 1 }).success).toBe(false);
    expect(isakInputSchema.safeParse({ ...base, femurBreadth: 30 }).success).toBe(false);
    expect(isakInputSchema.safeParse({ ...base, date: "09/11/2026" }).success).toBe(false);
  });
});

describe("importación", () => {
  it("JSON: objeto y errores por fila", () => {
    const rows = parseIsakFile(JSON.stringify([base, { ...base, weightKg: 5 }]), "json");
    expect(rows[0].input?.weightKg).toBe(75);
    expect(rows[1].errors.join()).toMatch(/weightKg/);
  });
  it("JSON no válido", () => {
    expect(parseIsakFile("{", "json")[0].errors[0]).toMatch(/JSON/);
  });
  it("CSV con alias en español, coma decimal y sexo H/M", () => {
    const csv = [
      "fecha;sexo;peso;talla;tríceps;subescapular;bíceps;cresta ilíaca;supraespinal;abdominal;muslo anterior;pierna medial;brazo flexionado;perímetro pierna;húmero;fémur;muñeca",
      "2026-11-09;H;75;178;10;9;5;12;7;12;11;6;33,5;37;7;9,8;5,7",
      "2026-11-10;M;60;165;x;9;5;12;7;12;11;6;30;35;6,2;9;5,2",
    ].join("\n");
    const rows = parseIsakFile(csv, "csv");
    expect(rows).toHaveLength(2);
    expect(rows[0].errors).toEqual([]);
    expect(rows[0].input).toMatchObject({ sex: "M", armFlexedGirth: 33.5, wristBreadth: 5.7, iliacCrest: 12 });
    expect(rows[1].line).toBe(3);
    expect(rows[1].errors.length).toBeGreaterThan(0);
  });
  it("CSV sin filas", () => {
    expect(parseIsakFile("fecha;peso", "csv")[0].errors[0]).toMatch(/cabecera/);
  });
});
