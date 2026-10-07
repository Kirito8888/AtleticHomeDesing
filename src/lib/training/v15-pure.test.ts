import { describe, expect, it } from "vitest";

import { waterTarget } from "@/lib/nutrition/hydration";
import { hrvCsvRows } from "@/lib/recovery/hrv-import";
import { currentPhase, defaultProtocol, painAllows } from "@/lib/recovery/return-protocol";
import { hooperIndex, sleepDebt } from "@/lib/recovery/wellness";
import { readPrefs } from "@/lib/rules/prefs";
import { conditionsAt, todayMaxTemp } from "@/lib/weather";

import { consistency } from "./consistency";
import { dailySrpe, fosterWeek } from "./load-metrics";

// Datos inventados.
describe("consistencia técnica", () => {
  it("media, mejor, CV y % de nulos", () => {
    const c = consistency([
      { markM: 50, isFoul: false },
      { markM: 52, isFoul: false },
      { markM: null, isFoul: true },
      { markM: 48, isFoul: false },
    ]);
    expect(c).toEqual({ attempts: 4, valid: 3, best: 52, mean: 50, cvPct: 4, foulPct: 25 });
    expect(consistency([{ markM: null, isFoul: true }])).toMatchObject({ valid: 0, cvPct: null, foulPct: 100 });
  });
});

describe("Foster, Hooper y sueño", () => {
  it("monotonía y strain; carga diaria sRPE con días vacíos", () => {
    expect(fosterWeek([300, 300, 300, 300, 300, 300, 300])).toMatchObject({ monotony: null }); // sin variación
    const w = fosterWeek([400, 0, 400, 0, 400, 0, 400]);
    expect(w.total).toBe(1600);
    expect(w.monotony).toBe(1.15);
    expect(dailySrpe([{ date: "2026-10-07", sessionRpe: 6, durationSec: 3600 }, { date: "2026-09-29", sessionRpe: 9, durationSec: 3600 }], "2026-10-07")).toEqual([0, 0, 0, 0, 0, 0, 360]);
  });

  it("índice Hooper y deuda de sueño", () => {
    expect(hooperIndex({ sleepQuality: 5, fatigue: 1, stress: 1, doms: 0 })).toBe(4);
    expect(hooperIndex({ sleepQuality: 1, fatigue: 5, stress: 5, doms: 10 })).toBe(20);
    expect(hooperIndex({ sleepQuality: null, fatigue: 1, stress: 1, doms: 0 })).toBeNull();
    expect(sleepDebt([{ date: "2026-10-06", sleepHours: 6 }, { date: "2026-10-05", sleepHours: 9 }, { date: "2026-09-20", sleepHours: 2 }], "2026-10-07", 8)).toEqual({ debtH: 2, nights: 2 });
  });
});

describe("hidratación", () => {
  it("ml/kg + sesión + calor, redondeado", () => {
    const p = readPrefs({});
    expect(waterTarget(p, 70, false, 20)).toMatchObject({ ml: 2450, hot: false });
    expect(waterTarget(p, 70, true, 31)).toMatchObject({ ml: 3450, hot: true });
  });
});

describe("vuelta tras lesión", () => {
  it("fase actual = primera con criterios pendientes; el dolor manda", () => {
    const p = defaultProtocol(true);
    expect(currentPhase(p)).toBe(0);
    p[0].criteria.forEach((c) => (c.done = true));
    expect(currentPhase(p)).toBe(1);
    expect(painAllows(p, 1, 3)).toBe(false);
    expect(p[3].name).toMatch(/Lanzamientos/);
  });
});

describe("importar VFC y sueño", () => {
  it("columnas, formatos, minutos y filas repetidas", () => {
    const csv = "date,rmssd,hr,sleep\n2026-10-05 07:30,85.2,48,450\n06/10/2026,90,,420\n2026-10-07,999,50,400\n2026-10-05,88,47,480\n";
    const m = { delimiter: "," as const, dateCol: 0, dateFormat: "YYYY-MM-DD" as const, hrvCol: 1, rhrCol: 2, sleepCol: 3, sleepUnit: "min" as const };
    const r = hrvCsvRows(csv, m);
    expect(r.rows).toEqual([{ line: 5, date: "2026-10-05", hrvRmssdMs: 88, restingHr: 47, sleepHours: 8 }]);
    expect(r.errors.map((e) => e.line)).toEqual([3, 4]);
  });
});

describe("Open-Meteo", () => {
  const fake = (body: unknown, ok = true) => (async () => ({ ok, json: async () => body })) as unknown as typeof fetch;
  it("elige la hora pedida; sin red o sin datos, null", async () => {
    const hourly = { time: ["2026-10-07T17:00", "2026-10-07T18:00"], temperature_2m: [20, 19.5], wind_speed_10m: [2, 3.1], wind_direction_10m: [180, 200], precipitation: [0, 0.2] };
    expect(await conditionsAt(42.34, -3.7, "2026-10-07", 18, fake({ hourly }))).toEqual({ tempC: 19.5, windMs: 3.1, windDirDeg: 200, rainMm: 0.2, at: "2026-10-07T18:00" });
    expect(await conditionsAt(42.34, -3.7, "2026-10-07", 9, fake({ hourly }))).toBeNull();
    expect(await conditionsAt(42.34, -3.7, "2026-10-07", 18, (async () => Promise.reject(new Error("sin red"))) as unknown as typeof fetch)).toBeNull();
    expect(await todayMaxTemp(10, 10, "2026-10-07", fake({ daily: { temperature_2m_max: [31.2] } }))).toBe(31.2);
  });
});
