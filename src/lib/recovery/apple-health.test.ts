import { describe, expect, it } from "vitest";

import { workoutSchema } from "@/lib/apple-fitness/payload";
import { mapActivity } from "@/lib/apple-fitness/normalize";

import { activityName, appleDays, appleWorkouts, feedApple, newAppleState } from "./apple-health";
import { healthImportSchema } from "./health-sync";

const xml = `<?xml version="1.0"?><HealthData>
<Record type="HKCategoryTypeIdentifierSleepAnalysis" sourceName="Watch" startDate="2026-10-07 23:30:00 +0200" endDate="2026-10-08 03:30:00 +0200" value="HKCategoryValueSleepAnalysisAsleepCore"/>
<Record type="HKCategoryTypeIdentifierSleepAnalysis" sourceName="Watch" startDate="2026-10-08 03:30:00 +0200" endDate="2026-10-08 07:00:00 +0200" value="HKCategoryValueSleepAnalysisAsleepDeep"/>
<Record type="HKCategoryTypeIdentifierSleepAnalysis" sourceName="Watch" startDate="2026-10-07 23:00:00 +0200" endDate="2026-10-08 07:10:00 +0200" value="HKCategoryValueSleepAnalysisInBed"/>
<Record type="HKQuantityTypeIdentifierRestingHeartRate" sourceName="Watch" unit="count/min" startDate="2026-10-08 08:00:00 +0200" endDate="2026-10-08 08:00:00 +0200" value="52"/>
<Record type="HKQuantityTypeIdentifierRestingHeartRate" sourceName="Watch" unit="count/min" startDate="2026-10-08 20:00:00 +0200" endDate="2026-10-08 20:00:00 +0200" value="55"/>
<Record type="HKQuantityTypeIdentifierStepCount" startDate="2026-10-08 08:00:00 +0200" endDate="2026-10-08 09:00:00 +0200" value="900"/>
<Record type="HKQuantityTypeIdentifierRestingHeartRate" startDate="2026-01-01 08:00:00 +0200" endDate="2026-01-01 08:00:00 +0200" value="60"/>
</HealthData>`;

function parse(text: string, from: string | null = "2026-06-01", step = 37) {
  const st = newAppleState();
  for (let i = 0; i < text.length; i += step) feedApple(st, text.slice(i, i + step), from);
  return st;
}

describe("Apple Health · días", () => {
  it("suma solo las fases de sueño y promedia la FC en reposo, aunque el XML llegue troceado", () => {
    expect(appleDays(parse(xml))).toEqual([{ date: "2026-10-08", sleepMin: 450, restingHr: 54, hrvSdnnMs: null, weightKg: null }]);
  });

  it("no cuenta dos veces el sueño solapado (reloj + iPhone)", () => {
    const t = `<HealthData>
<Record type="HKCategoryTypeIdentifierSleepAnalysis" sourceName="Watch" startDate="2026-10-07 23:00:00 +0200" endDate="2026-10-08 07:00:00 +0200" value="HKCategoryValueSleepAnalysisAsleepUnspecified"/>
<Record type="HKCategoryTypeIdentifierSleepAnalysis" sourceName="iPhone" startDate="2026-10-07 23:30:00 +0200" endDate="2026-10-08 06:30:00 +0200" value="HKCategoryValueSleepAnalysisAsleep"/>
</HealthData>`;
    expect(appleDays(parse(t))[0].sleepMin).toBe(480);
  });

  it("lee VFC SDNN (media del día) y peso (última muestra; libras → kg)", () => {
    const t = `<HealthData>
<Record type="HKQuantityTypeIdentifierHeartRateVariabilitySDNN" unit="ms" startDate="2026-10-08 03:00:00 +0200" endDate="2026-10-08 03:00:00 +0200" value="40"/>
<Record type="HKQuantityTypeIdentifierHeartRateVariabilitySDNN" unit="ms" startDate="2026-10-08 05:00:00 +0200" endDate="2026-10-08 05:00:00 +0200" value="50"/>
<Record type="HKQuantityTypeIdentifierBodyMass" unit="kg" startDate="2026-10-08 07:00:00 +0200" endDate="2026-10-08 07:00:00 +0200" value="62.4"/>
<Record type="HKQuantityTypeIdentifierBodyMass" unit="lb" startDate="2026-10-09 07:00:00 +0200" endDate="2026-10-09 07:00:00 +0200" value="137.6"/>
<Record type="HKQuantityTypeIdentifierBodyMass" unit="kg" startDate="2026-10-10 07:00:00 +0200" endDate="2026-10-10 07:00:00 +0200" value="5"/>
</HealthData>`;
    expect(appleDays(parse(t))).toEqual([
      { date: "2026-10-08", sleepMin: 0, restingHr: null, hrvSdnnMs: 45, weightKg: 62.4 },
      { date: "2026-10-09", sleepMin: 0, restingHr: null, hrvSdnnMs: null, weightKg: 62.41 },
    ]);
  });

  it("respeta el filtro «desde» y los días salen listos para el servidor", () => {
    const st = parse(xml, "2026-10-09");
    expect(appleDays(st)).toEqual([]);
    const ok = healthImportSchema.parse({ days: appleDays(parse(xml)).map((d) => ({ date: d.date, sleepMin: d.sleepMin, restingHr: d.restingHr })) });
    expect(ok).toMatchObject([{ date: "2026-10-08", sleepHours: 7.5, restingHr: 54 }]);
  });
});

const WATCH_NEW = `<Workout workoutActivityType="HKWorkoutActivityTypeRunning" duration="45.5" durationUnit="min" sourceName="Watch" startDate="2026-10-08 08:30:00 +0200" endDate="2026-10-08 09:15:30 +0200">
 <MetadataEntry key="HKIndoorWorkout" value="0"/>
 <WorkoutEvent type="HKWorkoutEventTypePause" date="2026-10-08 08:50:00 +0200"/>
 <WorkoutStatistics type="HKQuantityTypeIdentifierDistanceWalkingRunning" startDate="2026-10-08 08:30:00 +0200" endDate="2026-10-08 09:15:30 +0200" sum="7.2" unit="km"/>
 <WorkoutStatistics type="HKQuantityTypeIdentifierActiveEnergyBurned" startDate="2026-10-08 08:30:00 +0200" endDate="2026-10-08 09:15:30 +0200" sum="2008" unit="kJ"/>
 <WorkoutStatistics type="HKQuantityTypeIdentifierHeartRate" startDate="2026-10-08 08:30:00 +0200" endDate="2026-10-08 09:15:30 +0200" average="148.4" minimum="90" maximum="171" unit="count/min"/>
</Workout>`;
const WATCH_OLD = `<Workout workoutActivityType="HKWorkoutActivityTypeTraditionalStrengthTraining" duration="3000" durationUnit="s" totalDistance="0" totalDistanceUnit="km" totalEnergyBurned="320" totalEnergyBurnedUnit="kcal" startDate="2026-10-09 18:00:00 +0200" endDate="2026-10-09 18:50:00 +0200"/>`;
const MILES = `<Workout workoutActivityType="HKWorkoutActivityTypeCycling" duration="1" durationUnit="h" totalDistance="10" totalDistanceUnit="mi" startDate="2026-10-10 10:00:00 +0200" endDate="2026-10-10 11:00:00 +0200"></Workout>`;
const doc = (...ws: string[]) => `<?xml version="1.0"?><HealthData>\n<Record type="HKQuantityTypeIdentifierRestingHeartRate" unit="count/min" startDate="2026-10-08 08:00:00 +0200" endDate="2026-10-08 08:00:00 +0200" value="52"/>\n${ws.join("\n")}\n<Record type="HKQuantityTypeIdentifierBodyMass" unit="kg" startDate="2026-10-11 07:00:00 +0200" endDate="2026-10-11 07:00:00 +0200" value="62"/></HealthData>`;

describe("Apple Fitness · entrenos del export.xml", () => {
  it("lee un entreno con WorkoutStatistics (iOS 16+): distancia, kJ → kcal y FC", () => {
    const [w] = appleWorkouts(parse(doc(WATCH_NEW)));
    expect(w).toMatchObject({ type: "Correr", start: "2026-10-08 08:30:00 +0200", end: "2026-10-08 09:15:30 +0200", durationMin: 45.5, distanceM: 7200, kcal: 480, hrAvg: 148, hrMax: 171 });
  });

  it("lee el formato antiguo (totales en el propio <Workout>, autocerrado), y horas o millas", () => {
    const ws = appleWorkouts(parse(doc(WATCH_OLD, MILES)));
    expect(ws).toHaveLength(2);
    expect(ws[0]).toMatchObject({ type: "Fuerza", durationMin: 50, kcal: 320 });
    expect(ws[0].distanceM).toBeUndefined();
    expect(ws[1]).toMatchObject({ type: "Ciclismo", durationMin: 60, distanceM: 16093 });
  });

  it("da igual dónde se corte el fichero (también a mitad de un <Workout>)", () => {
    const text = doc(WATCH_NEW, WATCH_OLD, MILES);
    const whole = appleWorkouts(parse(text, "2026-06-01", text.length));
    for (const step of [1, 7, 53, 211, 500]) {
      const st = parse(text, "2026-06-01", step);
      expect(appleWorkouts(st)).toEqual(whole);
      expect(appleDays(st)).toEqual(appleDays(parse(text, "2026-06-01", text.length)));
    }
    expect(whole).toHaveLength(3);
    expect(appleDays(parse(text))).toEqual([
      { date: "2026-10-08", sleepMin: 0, restingHr: 52, hrvSdnnMs: null, weightKg: null },
      { date: "2026-10-11", sleepMin: 0, restingHr: null, hrvSdnnMs: null, weightKg: 62 },
    ]);
  });

  it("filtra por «desde», omite los entrenos sin fechas o de menos de 1 min y no repite", () => {
    const bad = `<Workout workoutActivityType="HKWorkoutActivityTypeYoga" startDate="nada" endDate="nada"/>`;
    const short = `<Workout workoutActivityType="HKWorkoutActivityTypeYoga" startDate="2026-10-12 10:00:00 +0200" endDate="2026-10-12 10:00:30 +0200"/>`;
    const st = parse(doc(WATCH_NEW, WATCH_NEW, bad, short), "2026-10-01");
    expect(appleWorkouts(st)).toHaveLength(1);
    expect(st.skipped).toBe(2);
    expect(appleWorkouts(parse(doc(WATCH_NEW), "2026-10-09"))).toEqual([]);
  });

  it("lo que sale lo acepta tal cual el esquema del servidor y cae en la modalidad correcta", () => {
    const ws = appleWorkouts(parse(doc(WATCH_NEW, WATCH_OLD, MILES)));
    for (const w of ws) expect(() => workoutSchema.parse(w)).not.toThrow();
    expect(ws.map((w) => mapActivity(w.type))).toEqual([
      { modality: "RUN", sessionType: "TRACK" },
      { modality: "OTHER", sessionType: "STRENGTH" },
      { modality: "CYCLE", sessionType: "TRACK" },
    ]);
  });

  it("nombra los tipos desconocidos en inglés legible, sin romper", () => {
    expect(activityName("HKWorkoutActivityTypeCrossCountrySkiing")).toBe("Cross Country Skiing");
    expect(activityName("HKWorkoutActivityTypeOther")).toBe("Otro");
    expect(activityName(null)).toBe("Otro");
    const st = parse(`<HealthData><Workout workoutActivityType="HKWorkoutActivityTypeYoga" startDate="2026-10-12 10:00:00 +0200" endDate="2026-10-12 10:40:00 +0200"/></HealthData>`);
    expect(() => workoutSchema.parse(appleWorkouts(st)[0])).not.toThrow();
  });
});
