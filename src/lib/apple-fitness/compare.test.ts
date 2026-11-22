import { describe, expect, it } from "vitest";

import { compareWorkout, mergePatch, type WatchValues, type WebValues } from "./compare";

const watch: WatchValues = { durationSec: 2700, distanceM: 7200, hrAvg: 148, hrMax: 171, kcal: 480 };
const web = (o: Partial<WebValues> = {}): WebValues => ({ type: "TRACK", durationSec: 2640, distanceM: null, hrAvg: null, hrMax: null, kcal: null, hasTrack: true, ...o });
const row = (rows: ReturnType<typeof compareWorkout>, f: string) => rows.find((r) => r.field === f)!;

describe("compareWorkout", () => {
  it("devuelve las 5 filas con web y reloj en las mismas unidades", () => {
    const rows = compareWorkout(watch, web({ distanceM: 7000, hrAvg: 150 }));
    expect(rows.map((r) => r.field)).toEqual(["duration", "distance", "hrAvg", "hrMax", "kcal"]);
    expect(row(rows, "duration")).toMatchObject({ web: 44, watch: 45, unit: "min" });
    expect(row(rows, "distance")).toMatchObject({ web: 7, watch: 7.2, unit: "km" });
  });
  it("rellena solo los huecos de la web; lo que ya hay nunca se pisa", () => {
    const rows = compareWorkout(watch, web({ distanceM: 5000, hrAvg: 140 }));
    expect(row(rows, "duration").willFill).toBe(false);
    expect(row(rows, "distance").willFill).toBe(false);
    expect(row(rows, "hrAvg").willFill).toBe(false);
    expect(row(rows, "hrMax").willFill).toBe(true);
    expect(row(rows, "kcal").willFill).toBe(true);
  });
  it("marca «difiere» solo si pasa la tolerancia", () => {
    const rows = compareWorkout(watch, web({ durationSec: 2640, distanceM: 5000 }));
    expect(row(rows, "duration").differs).toBe(false); // 44 vs 45 min
    expect(row(rows, "distance").differs).toBe(true); // 5 vs 7,2 km
  });
  it("sesión de fuerza sin parte de pista: no promete FC ni distancia", () => {
    const rows = compareWorkout(watch, web({ type: "STRENGTH", hasTrack: false }));
    expect(["distance", "hrAvg", "hrMax"].map((f) => row(rows, f).willFill)).toEqual([false, false, false]);
    expect(row(rows, "kcal").willFill).toBe(true);
  });
  it("sesión planificada sin duración (0) la completa el reloj", () => {
    expect(row(compareWorkout(watch, web({ durationSec: 0 })), "duration").willFill).toBe(true);
    expect(row(compareWorkout(watch, web({ durationSec: null })), "duration").willFill).toBe(true);
  });
  it("un dato que el reloj no trae no se rellena", () => {
    const rows = compareWorkout({ ...watch, hrAvg: null, kcal: null }, web());
    expect([row(rows, "hrAvg").willFill, row(rows, "kcal").willFill]).toEqual([false, false]);
  });
});

describe("mergePatch", () => {
  it("solo trae los campos con hueco", () => {
    expect(mergePatch(watch, web({ distanceM: 5000 }))).toEqual({ hrAvg: 148, hrMax: 171, kcal: 480 });
  });
  it("vacío si no falta nada", () => {
    expect(mergePatch(watch, web({ distanceM: 1, hrAvg: 1, hrMax: 1, kcal: 1 }))).toEqual({});
  });
  it("MIXED sin track puede recibir FC y distancia; TECHNICAL no", () => {
    expect(mergePatch(watch, web({ type: "MIXED", hasTrack: false }))).toMatchObject({ distanceM: 7200, hrAvg: 148 });
    expect(mergePatch(watch, web({ type: "TECHNICAL", hasTrack: false }))).toEqual({ kcal: 480 });
  });
});
