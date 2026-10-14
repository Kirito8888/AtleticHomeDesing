import { describe, expect, it } from "vitest";

import { readPrefs } from "@/lib/rules/prefs";

import { lastMonths, monthlyTrends, type TrendCheck, type TrendFeeling, type TrendSession, trendAlerts } from "./trends";

// Datos inventados. Hoy = 2026-10-14; 6 meses: mayo → octubre.
const TODAY = "2026-10-14";
const prefs = readPrefs({});
const day = (m: string, d: number) => `${m}-${String(d).padStart(2, "0")}`;
const check = (date: string, v: Partial<TrendCheck>): TrendCheck => ({ date, sleepHours: null, hrvRmssdMs: null, squeezePain: null, heelPain: null, ...v });

/** 10 noches de sueño y 5 mañanas de VFC por mes. */
function month(m: string, sleep: number, hrv: number): TrendCheck[] {
  return Array.from({ length: 10 }, (_, i) => check(day(m, i + 1), { sleepHours: sleep, hrvRmssdMs: i < 5 ? hrv : null }));
}
const session = (date: string, rpe: number, min: number): TrendSession => ({ date, sessionRpe: rpe, durationSec: min * 60 });

describe("tendencias de meses", () => {
  it("lista los meses hasta el actual", () => {
    expect(lastMonths(TODAY, 3)).toEqual(["2026-08", "2026-09", "2026-10"]);
    expect(lastMonths("2026-02-03", 3)).toEqual(["2025-12", "2026-01", "2026-02"]);
  });

  it("agrega por mes y marca el actual como parcial", () => {
    const m = monthlyTrends({ today: TODAY, prefs, checks: month("2026-10", 7, 60), sessions: [session("2026-10-05", 5, 60)], feelings: [], hrvWeeks: ["2026-09-28"] });
    const cur = m.at(-1)!;
    expect(m).toHaveLength(6);
    expect(cur).toMatchObject({ month: "2026-10", partial: true, days: 14, sleepH: 7, sleepN: 10, hrv: 60, hrvN: 5, hrvMarkedN: 4 });
    expect(cur.loadWeekly).toBeCloseTo((300 / 14) * 7);
    expect(m[0].sleepH).toBeNull();
  });

  it("bajada de sueño y de VFC con subida de carga → avisos con causa y valores, y aviso combinado", () => {
    const checks = [...month("2026-07", 8, 100), ...month("2026-08", 8, 100), ...month("2026-09", 8, 100), ...month("2026-10", 7, 90)];
    const sessions = [session("2026-07-10", 5, 60), session("2026-08-10", 5, 60), session("2026-09-10", 5, 60), session("2026-10-02", 8, 120), session("2026-10-09", 8, 120)];
    const alerts = trendAlerts(monthlyTrends({ today: TODAY, prefs, checks, sessions, feelings: [], hrvWeeks: [] }), prefs);
    expect(alerts.map((a) => a.id)).toEqual(["trend-combo", "trend-sleep", "trend-hrv", "trend-load"]);
    const sleep = alerts.find((a) => a.id === "trend-sleep")!;
    expect(sleep.title).toBe("Duermes 1 h menos que en los meses anteriores");
    expect(sleep.cause).toContain("7 h frente a 8 h");
    expect(sleep.threshold).toBe("Bajada de sueño ≥ 0,5 h");
    expect(alerts.find((a) => a.id === "trend-hrv")!.title).toBe("VFC −10 % frente a los meses anteriores");
    expect(alerts.find((a) => a.id === "trend-hrv")!.values[0]).toEqual({ label: "Mes reciente 10/2026", value: "90 ms" });
  });

  it("molestias: más días por encima de tus umbrales que antes", () => {
    const checks = [...month("2026-08", 8, 100), ...month("2026-09", 8, 100), ...month("2026-10", 8, 100)];
    const feelings: TrendFeeling[] = [1, 2, 3, 4, 5].map((d) => ({ date: day("2026-10", d), pain: 6 }));
    const alerts = trendAlerts(monthlyTrends({ today: TODAY, prefs, checks, sessions: [], feelings, hrvWeeks: [] }), prefs);
    expect(alerts.map((a) => a.id)).toEqual(["trend-pain"]);
    expect(alerts[0].cause).toContain("5 días con molestia");
  });

  it("los umbrales son los de «Mis reglas»", () => {
    const checks = [...month("2026-08", 8, 100), ...month("2026-09", 8, 100), ...month("2026-10", 7.8, 100)];
    const run = (p: Parameters<typeof readPrefs>[0]) => {
      const pr = readPrefs(p);
      return trendAlerts(monthlyTrends({ today: TODAY, prefs: pr, checks, sessions: [], feelings: [], hrvWeeks: [] }), pr).map((a) => a.id);
    };
    expect(run({})).toEqual([]);
    expect(run({ trendSleepDropH: 0.2 })).toEqual(["trend-sleep"]);
  });

  it("sin base suficiente o con pocas lecturas no avisa", () => {
    const few = [...month("2026-09", 8, 100), ...month("2026-10", 5, 50)];
    expect(trendAlerts(monthlyTrends({ today: TODAY, prefs, checks: few, sessions: [], feelings: [], hrvWeeks: [] }), prefs)).toEqual([]);
    const sparse = [check("2026-08-01", { sleepHours: 8 }), check("2026-09-01", { sleepHours: 8 }), check("2026-10-01", { sleepHours: 4 })];
    expect(trendAlerts(monthlyTrends({ today: TODAY, prefs, checks: sparse, sessions: [], feelings: [], hrvWeeks: [] }), prefs)).toEqual([]);
  });
});
