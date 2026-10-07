import { describe, expect, it } from "vitest";

import { compliance } from "@/lib/planning/compliance";
import { readPrefs } from "@/lib/rules/prefs";

import { parseSetsReps, planToBlocks } from "./plan-to-form";
import { apreAdjust, epley, findRm, loadToKg, nameKey, parseAnnexRms, parsePercents, type RmEntry, testDecision } from "./rm";

// Valores inventados.
const rm = (name: string, kg: number, perHand = false): RmEntry => ({ name, key: nameKey(name), kg, perHand });
const RMS = [rm("Sentadilla frontal", 100), rm("Press banca mancuernas (por mano)", 30, true), rm("Peso muerto rumano barra", 120)];

describe("tabla de RM y kg", () => {
  it("normaliza nombres y encuentra la RM aunque cambie un poco el nombre", () => {
    expect(nameKey("Press banca mancuernas · SERIE DE TEST")).toBe("press banca mancuernas");
    expect(nameKey("Rotación torácica («libro abierto»)")).toBe("rotacion toracica");
    expect(findRm("Sentadilla frontal · SERIE DE TEST", RMS)?.kg).toBe(100);
    expect(findRm("Peso muerto rumano", RMS)?.kg).toBe(120);
    expect(findRm("Remo Pendlay", RMS)).toBeNull();
    expect(findRm("Remo Pendlay", RMS, new Map([["remo pendlay", "sentadilla frontal"]]))?.kg).toBe(100);
  });

  it("%RM → kg con redondeo y por mano", () => {
    expect(parsePercents("33 % y 66 %")).toEqual([33, 66]);
    expect(loadToKg("83 %", RMS[0], 2.5)).toBe("82,5 kg");
    expect(loadToKg("33 % y 66 %", RMS[0], 2.5)).toBe("32,5 / 65 kg");
    expect(loadToKg("81 %", RMS[1], 1)).toBe("24 kg por mano");
    expect(loadToKg("Peso corporal", RMS[0], 2.5)).toBeNull();
    expect(loadToKg("40 % de 88 %", RMS[0], 2.5)).toBeNull();
    expect(loadToKg("≥95 % de esfuerzo", RMS[0], 2.5)).toBeNull();
    expect(loadToKg("83 %", null, 2.5)).toBeNull();
  });

  it("serie de test (Epley) y umbral del 5 %", () => {
    expect(epley(100, 5)).toBe(116.7);
    expect(testDecision(115, 100, 5)).toMatchObject({ estimated: 116.7, update: false });
    expect(testDecision(100, 100, 5)).toMatchObject({ update: true });
    expect(testDecision(null, 80, 3).update).toBe(true);
  });

  it("APRE: ajuste según repeticiones de la serie 3", () => {
    expect(apreAdjust(6, 6)).toMatchObject({ kg: 0 });
    expect(apreAdjust(6, 9).kg).toBeGreaterThan(0);
    expect(apreAdjust(6, 2).kg).toBeLessThan(0);
    expect(apreAdjust(3, 3).kg).toBe(0);
  });

  it("lee la tabla de RM de un anexo (texto sintético)", () => {
    const text =
      "Ejercicio RM ¿Lo uso en M1? Sentadilla trasera 100 Sí Prensa 200 No Clean colgante 60 Sí: referencia ~40 con barra (estimado) No " +
      "Press militar mancuerna (por mano) 20,5 Sí Dominada (peso corporal) 8 repeticiones máximas Sí, por RIR Hip thrust 150 Excluido";
    expect(parseAnnexRms(text)).toEqual([
      { name: "Sentadilla trasera", kg: 100, perHand: false, used: true },
      { name: "Prensa", kg: 200, perHand: false, used: false },
      { name: "Clean colgante", kg: 60, perHand: false, used: true },
      { name: "Press militar mancuerna (por mano)", kg: 20.5, perHand: true, used: true },
      { name: "Hip thrust", kg: 150, perHand: false, used: false },
    ]);
  });
});

describe("registrar desde el plan", () => {
  it("series × reps", () => {
    expect(parseSetsReps("3 × 4")).toEqual([{ sets: 3, reps: 4 }]);
    expect(parseSetsReps("1 × 6 y 1 × 6")).toEqual([
      { sets: 1, reps: 6 },
      { sets: 1, reps: 6 },
    ]);
    expect(parseSetsReps("3 × (mi máximo − 2)")).toEqual([{ sets: 3, reps: null }]);
  });

  it("precarga series con kg, rampas como calentamiento y avisa de lo que no está en el catálogo", () => {
    const row = (exercise: string, sets: string, load: string, ramp = false) => ({ exercise, sets, load, rir: "", rest: "", how: "", ramp });
    const blocks = [
      {
        kind: "table" as const,
        rows: [
          row("↳ Rampa (no cuenta)", "1 × 6 y 1 × 6", "33 % y 66 %", true),
          row("Sentadilla frontal · SERIE DE TEST", "1 × máximo técnico", "83 %"),
          row("Sentadilla frontal", "3 × 4", "83 %"),
          row("Face pulls", "3 × 12", "Banda"),
          row("Ejercicio raro", "2 × 5", "50 %"),
        ],
      },
    ];
    const r = planToBlocks(blocks, {
      rms: RMS,
      aliases: new Map(),
      catalog: new Map([
        ["sentadilla frontal", "ex-front"],
        ["face pulls", "ex-face"],
      ]),
      exerciseAliases: new Map(),
      step: 2.5,
    });
    expect(r.unmatched).toEqual(["Ejercicio raro"]);
    expect(r.blocks.map((b) => [b.exerciseId, b.sets.map((s) => `${s.isWarmup ? "c" : ""}${s.reps}×${s.weightKg}`)])).toEqual([
      ["ex-front", ["c6×32.5", "c6×65", "4×82.5", "4×82.5", "4×82.5"]],
      ["ex-face", ["12×0", "12×0", "12×0"]],
    ]);
  });
});

describe("cumplimiento del plan", () => {
  it("por semana: hechos, saltados, perdidos y pendientes; % sobre lo que ya tocaba", () => {
    const r = compliance(
      [
        { week: 1, date: "2026-10-05", status: "COMPLETED" },
        { week: 1, date: "2026-10-07", status: "SKIPPED" },
        { week: 1, date: "2026-10-09", status: "PLANNED" },
        { week: 2, date: "2026-10-12", status: "COMPLETED" },
        { week: 2, date: "2026-10-20", status: "PLANNED" },
        { week: 2, date: "2026-10-21", status: null },
      ],
      "2026-10-15",
    );
    expect(r.weeks).toEqual([
      { week: 1, planned: 3, done: 1, skipped: 1, missed: 1, pending: 0, pct: 33 },
      { week: 2, planned: 2, done: 1, skipped: 0, missed: 0, pending: 1, pct: 100 },
    ]);
    expect(r.total.pct).toBe(50);
  });
});

describe("mis reglas", () => {
  it("valores por defecto y datos inválidos", () => {
    expect(readPrefs(null)).toMatchObject({ kgStep: 2.5, squeezeMax: 3, throwCapRatio: 1.3, weightMinKg: null });
    expect(readPrefs({ kgStep: 1.25, squeezeMax: 4 })).toMatchObject({ kgStep: 1.25, squeezeMax: 4 });
    expect(readPrefs({ kgStep: 3 }).kgStep).toBe(2.5); // inválido → por defecto
  });
});
