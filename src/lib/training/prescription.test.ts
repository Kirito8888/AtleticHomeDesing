import { describe, expect, it } from "vitest";

import type { Level } from "@/lib/routine/profile";

import { basisFor, CITATIONS, citationsFor, doiUrl, formatCitation, goalFor, MAX_SETS, MIN_SETS, PRESCRIPTION, type PrescriptionGoal, prescribe, restLabel, setsPerExercise } from "./prescription";

const LEVELS: Level[] = ["principiante", "intermedio", "avanzado"];
const GOALS = Object.keys(PRESCRIPTION) as PrescriptionGoal[];

describe("citas", () => {
  it("cada cita tiene autores, año, título, revista y un DOI bien formado (enlace público de doi.org)", () => {
    for (const c of CITATIONS) {
      expect(c.authors.length, c.id).toBeGreaterThan(2);
      expect(c.title.length, c.id).toBeGreaterThan(10);
      expect(c.journal.length, c.id).toBeGreaterThan(3);
      expect(c.year, c.id).toBeGreaterThanOrEqual(1990);
      expect(c.year, c.id).toBeLessThanOrEqual(2026);
      expect(c.doi, c.id).toMatch(/^10\.\d{4,9}\/\S+$/);
      expect(doiUrl(c), c.id).toBe(`https://doi.org/${c.doi}`);
      expect(formatCitation(c)).toContain(`doi:${c.doi}`);
    }
  });
  it("ids y DOI únicos; los ids desconocidos se ignoran", () => {
    expect(new Set(CITATIONS.map((c) => c.id)).size).toBe(CITATIONS.length);
    expect(new Set(CITATIONS.map((c) => c.doi.toLowerCase())).size).toBe(CITATIONS.length);
    expect(citationsFor(["acsm2009", "acsm2009", "no-existe"]).map((c) => c.id)).toEqual(["acsm2009"]);
  });
});

describe("reglas", () => {
  it("toda regla cita fuentes que existen y rangos coherentes", () => {
    const ids = new Set(CITATIONS.map((c) => c.id));
    for (const g of GOALS) {
      for (const l of LEVELS) {
        const r = prescribe(g, l);
        expect(r.refs.length, `${g}/${l}`).toBeGreaterThan(0);
        for (const ref of r.refs) expect(ids.has(ref), `${g}/${l}: ${ref}`).toBe(true);
        expect(r.weeklySets[0]).toBeLessThanOrEqual(r.weeklySets[1]);
        expect(r.reps[0]).toBeLessThanOrEqual(r.reps[1]);
        expect(r.restSec).toBeGreaterThan(0);
        expect(r.rir).toMatch(/^RIR \d/);
      }
    }
  });
  it("fuerza: menos repeticiones y más descanso que resistencia muscular; más volumen con el nivel", () => {
    for (const l of LEVELS) {
      expect(prescribe("fuerza", l).reps[1]).toBeLessThan(prescribe("resistencia_muscular", l).reps[1]);
      expect(prescribe("fuerza", l).restSec).toBeGreaterThan(prescribe("resistencia_muscular", l).restSec);
    }
    for (const g of GOALS) {
      expect(prescribe(g, "avanzado").weeklySets[1]).toBeGreaterThan(prescribe(g, "principiante").weeklySets[1]);
    }
  });
  it("hipertrofia de nivel intermedio llega a ≥ 10 series semanales por grupo (Schoenfeld 2017)", () => {
    expect(prescribe("hipertrofia", "intermedio").weeklySets[0]).toBeGreaterThanOrEqual(10);
  });
});

describe("dosis", () => {
  it("series por ejercicio entre el mínimo y el máximo, repartidas por las veces que se trabaja", () => {
    const r = prescribe("hipertrofia", "avanzado"); // 12 series/semana
    expect(setsPerExercise(r, 1)).toBe(MAX_SETS);
    expect(setsPerExercise(r, 3)).toBe(4);
    expect(setsPerExercise(r, 99)).toBe(MIN_SETS);
    expect(setsPerExercise(r, 0)).toBe(MAX_SETS);
  });
  it("justificación en castellano con las citas de la regla y sin datos personales", () => {
    const b = basisFor("fuerza", "intermedio", { group: "piernas", timesPerWeek: 2, sets: 3 });
    expect(b.refs).toEqual(prescribe("fuerza", "intermedio").refs);
    expect(b.why).toContain("piernas");
    expect(b.why).toContain("RIR 2");
    expect(b.why).toContain("2,5 min");
    expect(basisFor("fuerza", "intermedio", { group: "piernas", timesPerWeek: 1, sets: 2, trimmed: true }).why).toContain("tiempo");
  });
  it("objetivo de la rutina y descansos legibles", () => {
    expect(goalFor("fuerza")).toBe("fuerza");
    expect(goalFor("correr_5k")).toBe("resistencia_muscular");
    expect(goalFor("perder_grasa")).toBe("hipertrofia");
    expect([restLabel(45), restLabel(90), restLabel(120), restLabel(150)]).toEqual(["45 s", "90 s", "2 min", "2,5 min"]);
  });
});
