import { allowedEquipment, type Area, type Avoid, type Equipment, locationOf, type PlanRequest } from "./options";
import type { AiExercise, AiPlan } from "./schema";

/**
 * Generador determinista que respeta el cuestionario, para tests y E2E (no
 * hay clave de Gemini en la CI). Solo se usa con LIFEOS_FAKE_AI=1; en
 * producción el plan lo genera siempre Gemini.
 */
type LibEntry = { name: string; equipment: Equipment[]; patterns: Avoid[]; areas: Area[] };

const LIBRARY: LibEntry[] = [
  { name: "Sentadilla con barra", equipment: ["barra_discos"], patterns: ["cargas_axiales"], areas: ["KNEE", "LOWER_BACK"] },
  { name: "Sentadilla goblet", equipment: ["kettlebell"], patterns: [], areas: ["KNEE"] },
  { name: "Sentadilla búlgara con mancuernas", equipment: ["mancuernas", "banco"], patterns: [], areas: ["KNEE"] },
  { name: "Peso muerto rumano con mancuernas", equipment: ["mancuernas"], patterns: [], areas: ["HAMSTRING"] },
  { name: "Puente de glúteo", equipment: ["peso_corporal"], patterns: [], areas: [] },
  { name: "Zancada atrás", equipment: ["peso_corporal"], patterns: [], areas: ["KNEE"] },
  { name: "Flexiones", equipment: ["peso_corporal"], patterns: [], areas: ["WRIST_HAND"] },
  { name: "Remo invertido en TRX", equipment: ["trx"], patterns: [], areas: [] },
  { name: "Remo con goma", equipment: ["gomas"], patterns: [], areas: [] },
  { name: "Press de banca con mancuernas", equipment: ["mancuernas", "banco"], patterns: [], areas: ["SHOULDER"] },
  { name: "Dominadas", equipment: ["barra_dominadas"], patterns: ["sobre_cabeza"], areas: ["ELBOW"] },
  { name: "Plancha frontal", equipment: ["peso_corporal"], patterns: [], areas: [] },
  { name: "Pallof press con goma", equipment: ["gomas"], patterns: ["rotaciones"], areas: [] },
  { name: "Saltos al cajón", equipment: ["cajon"], patterns: ["saltos", "impacto"], areas: ["ANKLE", "KNEE"] },
  { name: "Comba suave", equipment: ["comba"], patterns: ["saltos", "impacto"], areas: ["CALF", "ACHILLES"] },
  { name: "Aceleraciones de 20 m", equipment: ["pista"], patterns: ["carrera", "impacto"], areas: ["HAMSTRING"] },
  { name: "Bici suave", equipment: ["bici_cinta"], patterns: [], areas: [] },
  { name: "Nado continuo", equipment: ["piscina"], patterns: [], areas: [] },
  { name: "Lanzamiento de balón medicinal a pared", equipment: ["balon_medicinal"], patterns: ["lanzamientos", "rotaciones"], areas: ["SHOULDER"] },
  { name: "Bird dog", equipment: ["peso_corporal"], patterns: [], areas: [] },
  { name: "Elevación de talones", equipment: ["peso_corporal"], patterns: [], areas: ["CALF"] },
];

function fits(e: LibEntry, allowed: Set<string>, r: PlanRequest) {
  const avoid = new Set<string>(r.avoid);
  if (avoid.has("impacto")) avoid.add("saltos").add("carrera");
  return e.equipment.every((q) => allowed.has(q)) && !e.patterns.some((p) => avoid.has(p)) && !e.areas.some((a) => r.areas.includes(a));
}

function exercise(e: LibEntry, sets: number, allowed: Set<string>, r: PlanRequest, alts: LibEntry[]): AiExercise {
  return {
    name: e.name,
    sets,
    reps: r.level === "principiante" ? "10" : "6-8",
    intensity: r.level === "principiante" ? "RIR 3" : "RIR 2",
    rest: "90 s",
    how: "Movimiento controlado, sin dolor.",
    equipment: e.equipment,
    patterns: e.patterns,
    areas: e.areas,
    alternatives: alts.filter((a) => a !== e && fits(a, allowed, r)).slice(0, 3).map((a) => ({ name: a.name, equipment: a.equipment })),
  };
}

export function fakeAiPlan(r: PlanRequest): AiPlan {
  const phasesWeeks: Array<{ weeks: number; deload: boolean }> = [];
  let left = r.weeks;
  while (left > 0) {
    if (left <= 4 && r.weeks < 6) {
      phasesWeeks.push({ weeks: left, deload: false });
      left = 0;
    } else {
      const build = Math.min(3, left);
      phasesWeeks.push({ weeks: build, deload: false });
      left -= build;
      if (left > 0) {
        phasesWeeks.push({ weeks: 1, deload: true });
        left -= 1;
      }
    }
  }
  const days = r.weekdays.map((wd) => {
    const allowed = allowedEquipment(locationOf(r, wd)!, r.equipment);
    const pool = LIBRARY.filter((e) => fits(e, allowed, r));
    const pick = pool.slice(0, 4);
    const exs = pick.map((e) => exercise(e, 3, allowed, r, pool));
    return {
      weekday: wd,
      title: `Fuerza general ${wd}`,
      type: "STRENGTH" as const,
      durationMin: Math.min(r.minutes, 60),
      warmup: "5 min de movilidad articular y activación progresiva.",
      exercises: exs,
      cooldown: "5 min de estiramientos suaves.",
      light: { durationMin: Math.min(r.minutes, 40), exercises: exs.slice(0, 2).map((e) => ({ ...e, sets: 2, intensity: "Suave" })), note: "Mitad de volumen y sin impactos." },
    };
  });
  return {
    title: "Plan de prueba",
    summary: "Plan generado sin IA para pruebas.",
    why: "Respeta el material, los días y las limitaciones del cuestionario.",
    phases: phasesWeeks.map((p, i) => ({
      name: p.deload ? "Descarga" : `Bloque ${i + 1}`,
      focus: p.deload ? "Menos volumen para asimilar." : "Base de fuerza.",
      weeks: p.weeks,
      deload: p.deload,
      progression: p.deload ? 0 : 1,
      days: days.map((d) => (p.deload ? { ...d, exercises: d.exercises.map((e) => ({ ...e, sets: 2 })) } : d)),
    })),
  };
}
