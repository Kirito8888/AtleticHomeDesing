// v1.7 · Cuentas de demostración por tipo de público: perfiles y series SINTÉTICAS (generador con
// semilla fija), para ver cómo se usaría la app. Ningún dato real. Puro (sin BD).
import { addDays, dateOnly, toIsoDay } from "@/lib/dates";
import type { RoutineAnswers } from "@/lib/routine/questionnaire";

export const AUDIENCES = {
  BEGINNER: "Principiante",
  RUNNER: "Corredora popular",
  SENIOR: "Persona mayor",
  POSTPARTUM: "Posparto",
  THROWER: "Lanzador",
} as const;
export type Audience = keyof typeof AUDIENCES;

type Spec = {
  name: string;
  sex: "MALE" | "FEMALE";
  age: number;
  /** Sesiones por semana y su forma: tipo, título, minutos y RPE base. */
  week: Array<{ dow: number; type: "TRACK" | "TECHNICAL" | "STRENGTH" | "MIXED"; title: string; min: number; rpe: number }>;
  sleep: number;
  rhr: number;
  hrv: number;
  weight: number;
  routine: Omit<RoutineAnswers, "startDate"> | null;
};

const r = (o: Omit<RoutineAnswers, "startDate" | "parq" | "equipment" | "areas" | "avoid" | "tests"> & Partial<Pick<RoutineAnswers, "equipment" | "areas" | "tests">>): Omit<RoutineAnswers, "startDate"> => ({ parq: [], avoid: [], equipment: [], areas: [], tests: {}, ...o });

export const SPECS: Record<Audience, Spec> = {
  BEGINNER: {
    name: "Demo Principiante",
    sex: "MALE",
    age: 29,
    week: [
      { dow: 1, type: "STRENGTH", title: "Fuerza básica", min: 40, rpe: 5 },
      { dow: 4, type: "TRACK", title: "Caminar y trotar", min: 30, rpe: 4 },
    ],
    sleep: 6.8,
    rhr: 68,
    hrv: 45,
    weight: 82,
    routine: r({ sex: "M", age: 29, weightKg: 82, heightCm: 178, experience: "nunca", activity: "sedentaria", sleepHours: 7, tests: { pushups: 8, squats60: 25, plankSec: 35 }, shortGoal: "empezar", shortWeeks: 8, longGoal: "constancia", horizonMonths: 6, weekdays: [1, 4], minutes: 45, location: "casa", equipment: ["peso_corporal", "gomas"] }),
  },
  RUNNER: {
    name: "Demo Corredora",
    sex: "FEMALE",
    age: 38,
    week: [
      { dow: 2, type: "TRACK", title: "Rodaje suave", min: 45, rpe: 4 },
      { dow: 4, type: "TRACK", title: "Series 6×800", min: 55, rpe: 7 },
      { dow: 6, type: "TRACK", title: "Tirada larga", min: 80, rpe: 5 },
      { dow: 3, type: "STRENGTH", title: "Fuerza para corredoras", min: 35, rpe: 5 },
    ],
    sleep: 7.2,
    rhr: 54,
    hrv: 62,
    weight: 58,
    routine: r({ sex: "F", age: 38, weightKg: 58, heightCm: 165, experience: "1a3", activity: "activa", sleepHours: 7, tests: { pushups: 15, km1Sec: 290, plankSec: 70 }, shortGoal: "resistencia", shortWeeks: 6, longGoal: "carrera", horizonMonths: 6, weekdays: [2, 3, 4, 6], minutes: 60, location: "parque", equipment: ["peso_corporal", "gomas"] }),
  },
  SENIOR: {
    name: "Demo Mayor",
    sex: "FEMALE",
    age: 71,
    week: [
      { dow: 1, type: "STRENGTH", title: "Fuerza y equilibrio", min: 35, rpe: 4 },
      { dow: 3, type: "TRACK", title: "Paseo a buen ritmo", min: 40, rpe: 3 },
      { dow: 5, type: "STRENGTH", title: "Fuerza y equilibrio", min: 35, rpe: 4 },
    ],
    sleep: 6.5,
    rhr: 66,
    hrv: 28,
    weight: 64,
    routine: r({ sex: "F", age: 71, weightKg: 64, heightCm: 158, experience: "retomo", activity: "ligera", sleepHours: 7, tests: { sitStand30: 11, walk6Meters: 480 }, shortGoal: "movilidad", shortWeeks: 8, longGoal: "autonomia", horizonMonths: 12, weekdays: [1, 3, 5], minutes: 30, location: "casa", equipment: ["peso_corporal", "gomas"] }),
  },
  POSTPARTUM: {
    name: "Demo Posparto",
    sex: "FEMALE",
    age: 33,
    week: [
      { dow: 2, type: "TRACK", title: "Paseo con el carrito", min: 35, rpe: 3 },
      { dow: 5, type: "STRENGTH", title: "Suelo pélvico y core", min: 20, rpe: 3 },
    ],
    sleep: 5.6,
    rhr: 70,
    hrv: 35,
    weight: 66,
    // Con el modo posparto activo no se generan rutinas: la demo muestra ese bloqueo y la vuelta por fases
    routine: null,
  },
  THROWER: {
    name: "Demo Lanzador",
    sex: "MALE",
    age: 24,
    week: [
      { dow: 1, type: "TECHNICAL", title: "Técnica de jabalina", min: 75, rpe: 6 },
      { dow: 2, type: "STRENGTH", title: "Fuerza máxima", min: 70, rpe: 8 },
      { dow: 4, type: "TECHNICAL", title: "Lanzamientos con implemento ligero", min: 60, rpe: 6 },
      { dow: 5, type: "STRENGTH", title: "Potencia y pliometría", min: 60, rpe: 7 },
      { dow: 6, type: "TRACK", title: "Velocidad 6×30 m", min: 45, rpe: 6 },
    ],
    sleep: 7.6,
    rhr: 52,
    hrv: 75,
    weight: 92,
    routine: null,
  },
};

/** PRNG pequeño y determinista (mulberry32). */
export function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** 4 semanas hechas (con alguna sesión saltada) + 1 semana planificada, y 28 días de recuperación. */
export function demoSeries(audience: Audience, today: string, seed = 7) {
  const spec = SPECS[audience];
  const rand = rng(seed + audience.length);
  const jitter = (x: number, pct: number) => x * (1 + (rand() * 2 - 1) * pct);
  const t = dateOnly(today);
  const sessions: Array<{ date: string; type: Spec["week"][number]["type"]; title: string; durationSec: number; sessionRpe: number | null; status: "COMPLETED" | "PLANNED" }> = [];
  for (let d = -28; d <= 7; d++) {
    const day = addDays(t, d);
    const dow = ((day.getUTCDay() + 6) % 7) + 1;
    for (const w of spec.week.filter((x) => x.dow === dow)) {
      const future = d > 0;
      if (!future && rand() < 0.12) continue; // alguna se salta: la vida real
      sessions.push({ date: toIsoDay(day), type: w.type, title: w.title, durationSec: Math.round(jitter(w.min, 0.15)) * 60, sessionRpe: future ? null : Math.max(1, Math.min(10, Math.round(jitter(w.rpe, 0.2)))), status: future ? "PLANNED" : "COMPLETED" });
    }
  }
  const recovery = Array.from({ length: 28 }, (_, i) => {
    const day = toIsoDay(addDays(t, i - 27));
    return {
      date: day,
      sleepHours: Math.round(jitter(spec.sleep, 0.12) * 10) / 10,
      sleepQuality: Math.max(1, Math.min(5, Math.round(jitter(3.5, 0.3)))),
      restingHr: Math.round(jitter(spec.rhr, 0.05)),
      hrvRmssdMs: Math.round(jitter(spec.hrv, 0.15)),
      fatigue: Math.max(1, Math.min(5, Math.round(jitter(2.5, 0.35)))),
      stress: Math.max(1, Math.min(5, Math.round(jitter(2.5, 0.35)))),
      mood: Math.max(1, Math.min(5, Math.round(jitter(3.5, 0.25)))),
      doms: Math.max(0, Math.min(10, Math.round(jitter(3, 0.5)))),
      bodyWeightKg: Math.round(jitter(spec.weight, 0.01) * 10) / 10,
    };
  });
  const water = recovery.map((x) => ({ date: x.date, ml: Math.round(jitter(1800, 0.25) / 250) * 250 }));
  return { spec, sessions, recovery, water };
}
