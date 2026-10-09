// v1.7 · Generador determinista de rutinas (sin IA): del cuestionario a un plan con el mismo
// formato que los planes con IA (AiPlan), para reutilizar la expansión a días, la validación,
// la versión suave y la activación.
import { allowedEquipment, type Area, type Avoid, type Equipment, type PlanRequest } from "@/lib/ai-plan/options";
import type { AiExercise, AiPlan } from "@/lib/ai-plan/schema";

import type { Level } from "./profile";
import type { RoutineAnswers } from "./questionnaire";

type Slot = "pierna" | "empuje" | "tiron" | "core" | "cardio" | "movilidad" | "equilibrio";
type Lib = { name: string; slot: Slot; equipment: Equipment[]; patterns: Avoid[]; areas: Area[]; how: string };

const L: Lib[] = [
  // Pierna
  { name: "Sentadilla a una silla", slot: "pierna", equipment: ["peso_corporal"], patterns: [], areas: ["KNEE"], how: "Baja controlado hasta rozar la silla y sube sin impulso." },
  { name: "Sentadilla goblet", slot: "pierna", equipment: ["kettlebell"], patterns: [], areas: ["KNEE"], how: "Pesa pegada al pecho, espalda neutra." },
  { name: "Sentadilla con barra", slot: "pierna", equipment: ["barra_discos"], patterns: ["cargas_axiales"], areas: ["KNEE", "LOWER_BACK"], how: "Profundidad cómoda, rodillas en la línea de los pies." },
  { name: "Zancada atrás", slot: "pierna", equipment: ["peso_corporal"], patterns: [], areas: ["KNEE"], how: "Paso largo atrás, tronco erguido." },
  { name: "Puente de glúteo", slot: "pierna", equipment: ["peso_corporal"], patterns: [], areas: [], how: "Aprieta glúteo arriba 2 s, sin arquear la lumbar." },
  { name: "Peso muerto rumano con mancuernas", slot: "pierna", equipment: ["mancuernas"], patterns: [], areas: ["HAMSTRING", "LOWER_BACK"], how: "Cadera atrás, espalda recta, rodillas algo flexionadas." },
  { name: "Prensa de piernas", slot: "pierna", equipment: ["maquinas"], patterns: [], areas: ["KNEE"], how: "Rango cómodo, sin bloquear las rodillas." },
  { name: "Elevación de talones", slot: "pierna", equipment: ["peso_corporal"], patterns: [], areas: ["CALF", "ACHILLES"], how: "Sube y baja lento, 2 s abajo." },
  // Empuje
  { name: "Flexiones (de rodillas si hace falta)", slot: "empuje", equipment: ["peso_corporal"], patterns: [], areas: ["WRIST_HAND", "SHOULDER"], how: "Cuerpo en bloque, codos a 45°." },
  { name: "Flexiones en pared", slot: "empuje", equipment: ["peso_corporal"], patterns: [], areas: [], how: "Manos en la pared a la altura del pecho." },
  { name: "Press de banca con mancuernas", slot: "empuje", equipment: ["mancuernas", "banco"], patterns: [], areas: ["SHOULDER"], how: "Baja hasta la altura del pecho, sin rebote." },
  { name: "Press militar con mancuernas", slot: "empuje", equipment: ["mancuernas"], patterns: ["sobre_cabeza"], areas: ["SHOULDER"], how: "Abdomen firme, sin arquear la espalda." },
  { name: "Press de pecho con goma", slot: "empuje", equipment: ["gomas"], patterns: [], areas: [], how: "Goma anclada detrás, empuja al frente." },
  // Tirón
  { name: "Remo con goma", slot: "tiron", equipment: ["gomas"], patterns: [], areas: [], how: "Junta escápulas al final." },
  { name: "Remo con mancuerna a una mano", slot: "tiron", equipment: ["mancuernas", "banco"], patterns: [], areas: ["LOWER_BACK"], how: "Espalda paralela al suelo, tira hacia la cadera." },
  { name: "Remo invertido en TRX", slot: "tiron", equipment: ["trx"], patterns: [], areas: [], how: "Cuanto más vertical, más fácil." },
  { name: "Jalón al pecho", slot: "tiron", equipment: ["maquinas"], patterns: [], areas: ["SHOULDER"], how: "Pecho arriba, baja la barra a la clavícula." },
  { name: "Dominadas asistidas", slot: "tiron", equipment: ["barra_dominadas", "gomas"], patterns: ["sobre_cabeza"], areas: ["ELBOW", "SHOULDER"], how: "Con goma bajo los pies; baja controlado." },
  { name: "Remo a una mano con mochila", slot: "tiron", equipment: ["peso_corporal"], patterns: [], areas: [], how: "Mochila con libros; apoya la otra mano en una mesa." },
  // Core
  { name: "Plancha frontal", slot: "core", equipment: ["peso_corporal"], patterns: [], areas: [], how: "Cuerpo recto, sin hundir la cadera." },
  { name: "Bird dog", slot: "core", equipment: ["peso_corporal"], patterns: [], areas: [], how: "Brazo y pierna contrarios, sin mover la pelvis." },
  { name: "Dead bug", slot: "core", equipment: ["peso_corporal"], patterns: [], areas: [], how: "Lumbar pegada al suelo todo el rato." },
  { name: "Pallof press con goma", slot: "core", equipment: ["gomas"], patterns: ["rotaciones"], areas: [], how: "Resiste la rotación, brazos al frente." },
  // Cardio
  { name: "Caminar a paso vivo", slot: "cardio", equipment: ["peso_corporal"], patterns: [], areas: [], how: "Que puedas hablar pero no cantar." },
  { name: "Carrera suave continua", slot: "cardio", equipment: ["peso_corporal"], patterns: ["carrera", "impacto"], areas: ["KNEE", "CALF", "ACHILLES"], how: "Ritmo cómodo: puedes hablar en frases." },
  { name: "Correr y andar a intervalos", slot: "cardio", equipment: ["peso_corporal"], patterns: ["carrera", "impacto"], areas: ["KNEE", "CALF"], how: "1-3 min corriendo, 1-2 min andando." },
  { name: "Bici o elíptica", slot: "cardio", equipment: ["bici_cinta"], patterns: [], areas: [], how: "Ritmo constante, cadencia cómoda." },
  { name: "Nado continuo", slot: "cardio", equipment: ["piscina"], patterns: [], areas: ["SHOULDER"], how: "Estilo que domines, ritmo suave." },
  { name: "Comba suave", slot: "cardio", equipment: ["comba"], patterns: ["saltos", "impacto"], areas: ["CALF", "ACHILLES"], how: "Saltos bajos sobre la punta del pie." },
  // Movilidad y equilibrio
  { name: "Movilidad de cadera (90/90)", slot: "movilidad", equipment: ["peso_corporal"], patterns: [], areas: [], how: "Cambia de lado despacio, tronco erguido." },
  { name: "Gato-camello", slot: "movilidad", equipment: ["peso_corporal"], patterns: [], areas: [], how: "Respira con cada movimiento." },
  { name: "Rotaciones torácicas en el suelo", slot: "movilidad", equipment: ["peso_corporal"], patterns: [], areas: [], how: "De lado, abre el brazo siguiendo con la vista." },
  { name: "Estiramiento de flexores de cadera", slot: "movilidad", equipment: ["peso_corporal"], patterns: [], areas: [], how: "Rodilla en el suelo, aprieta glúteo." },
  { name: "Equilibrio a una pierna", slot: "equilibrio", equipment: ["peso_corporal"], patterns: [], areas: [], how: "Cerca de una pared; sube la dificultad cerrando los ojos." },
  { name: "Marcha talón-punta", slot: "equilibrio", equipment: ["peso_corporal"], patterns: [], areas: [], how: "En línea recta, mirada al frente." },
];

/** Respuestas → la forma de petición de los planes con IA (para validar y expandir con el mismo código). */
export function toPlanRequest(a: RoutineAnswers, level: Level): PlanRequest {
  const goal = a.shortGoal === "fuerza" ? "fuerza" : a.shortGoal === "perder_grasa" ? "recomposicion" : a.shortGoal === "resistencia" || a.shortGoal === "correr_5k" ? "resistencia" : "salud";
  const age = a.age;
  return {
    goal,
    discipline: a.shortGoal === "correr_5k" ? "fondo" : "general",
    level,
    ageBand: age < 18 ? "u18" : age < 30 ? "18-29" : age < 40 ? "30-39" : age < 50 ? "40-49" : age < 60 ? "50-59" : "60+",
    weekdays: [...a.weekdays].sort(),
    minutes: a.minutes,
    weeks: a.shortWeeks,
    startDate: a.startDate,
    dayLocations: a.weekdays.map(() => a.location),
    equipment: a.equipment,
    areas: a.areas,
    avoid: a.avoid,
    intensity: level === "principiante" ? "suave" : "media",
    style: a.shortGoal === "perder_grasa" ? "circuito" : "series",
    safety: [],
    competitionWeek: null,
  };
}

function fits(e: Lib, allowed: Set<string>, r: PlanRequest) {
  const avoid = new Set<string>(r.avoid);
  if (avoid.has("impacto")) avoid.add("saltos").add("carrera");
  return e.equipment.every((q) => allowed.has(q)) && !e.patterns.some((p) => avoid.has(p)) && !e.areas.some((a) => r.areas.includes(a));
}

const DOSE: Record<Level, { sets: number; reps: string; intensity: string; rest: string }> = {
  principiante: { sets: 2, reps: "10-12", intensity: "RIR 3 (te sobran 3 repeticiones)", rest: "90 s" },
  intermedio: { sets: 3, reps: "8-12", intensity: "RIR 2", rest: "90 s" },
  avanzado: { sets: 4, reps: "6-10", intensity: "RIR 1-2", rest: "2 min" },
};

function toExercise(e: Lib, level: Level, pool: Lib[], variant: number, cardioMin: number): AiExercise {
  const d = DOSE[level];
  const timed = e.slot === "cardio";
  const hold = e.name.startsWith("Plancha") || e.slot === "movilidad" || e.slot === "equilibrio";
  return {
    name: e.name,
    sets: timed ? 1 : hold ? 2 : d.sets,
    reps: timed ? `${cardioMin} min` : hold ? (level === "principiante" ? "20-30 s" : "30-45 s") : d.reps,
    intensity: timed ? (variant % 2 ? "Moderada (RPE 6)" : "Suave (RPE 4-5)") : hold ? "Controlado" : d.intensity,
    rest: timed ? "—" : hold ? "30 s" : d.rest,
    how: e.how,
    equipment: e.equipment,
    patterns: e.patterns,
    areas: e.areas,
    alternatives: pool.filter((x) => x.slot === e.slot && x !== e).slice(0, 2).map((x) => ({ name: x.name, equipment: x.equipment })),
  };
}

/** Qué bloques lleva cada día según el objetivo a corto plazo y la edad. */
function daySlots(a: RoutineAnswers, i: number): Slot[] {
  const older = a.age >= 60;
  switch (a.shortGoal) {
    case "fuerza":
      return i % 2 ? ["pierna", "tiron", "empuje", "pierna", "core"] : ["pierna", "empuje", "tiron", "core", "core"];
    case "resistencia":
    case "correr_5k":
      return i % 2 ? ["cardio", "pierna", "core"] : ["cardio", "movilidad"];
    case "perder_grasa":
      return ["pierna", "empuje", "tiron", "core", "cardio"];
    case "movilidad":
      return ["movilidad", "movilidad", "core", "equilibrio", "pierna"];
    default:
      return older ? ["pierna", "equilibrio", "tiron", "empuje", "movilidad"] : ["pierna", "empuje", "tiron", "core", "cardio"];
  }
}

export function generateRoutine(a: RoutineAnswers, level: Level): { plan: AiPlan; request: PlanRequest } {
  const r = toPlanRequest(a, level);
  const allowed = allowedEquipment(a.location, a.equipment);
  const pool = L.filter((e) => fits(e, allowed, r));
  const cardioBase = Math.max(10, Math.round(a.minutes * (a.shortGoal === "resistencia" || a.shortGoal === "correr_5k" ? 0.6 : 0.25) / 5) * 5);

  const days = r.weekdays.map((wd, i) => {
    const used = new Set<string>();
    const exs: AiExercise[] = [];
    for (const [j, slot] of daySlots(a, i).entries()) {
      const options = pool.filter((e) => e.slot === slot && !used.has(e.name));
      const e = options[(i + j) % Math.max(1, options.length)];
      if (!e) continue;
      used.add(e.name);
      exs.push(toExercise(e, level, pool, i, cardioBase));
    }
    if (!exs.length) exs.push(toExercise(L.find((e) => e.name === "Caminar a paso vivo")!, level, pool, i, cardioBase));
    const cardioDay = exs[0]?.reps.endsWith("min");
    return {
      weekday: wd,
      title: cardioDay ? "Resistencia y técnica de carrera" : a.shortGoal === "movilidad" ? "Movilidad y control" : `Fuerza ${i % 2 ? "B" : "A"}`,
      type: cardioDay ? ("TRACK" as const) : ("STRENGTH" as const),
      durationMin: a.minutes,
      warmup: "5-8 min: movilidad de tobillo, cadera y hombro + 2 series suaves del primer ejercicio.",
      exercises: exs,
      cooldown: "5 min de respiración y estiramientos suaves de lo trabajado.",
      light: {
        durationMin: Math.max(10, Math.round(a.minutes * 0.6)),
        exercises: exs.slice(0, 3).map((e) => ({ ...e, sets: Math.max(1, e.sets - 1), intensity: "Suave" })),
        note: "Día flojo o con molestias: menos series y sin apurar.",
      },
    };
  });

  // Fases de 3 semanas de carga + 1 de descarga (las de 4 semanas, 4 de carga suave)
  const phases: AiPlan["phases"] = [];
  let left = r.weeks;
  let n = 1;
  while (left > 0) {
    const build = r.weeks <= 4 ? left : Math.min(3, left);
    phases.push({ name: `Bloque ${n}`, focus: n === 1 ? "Técnica y hábito: aprender los movimientos con margen." : "Subir poco a poco el volumen.", weeks: build, deload: false, progression: 1, days });
    left -= build;
    if (left > 0) {
      phases.push({ name: "Semana de descarga", focus: "Menos volumen para asimilar lo trabajado.", weeks: 1, deload: true, progression: 0, days: days.map((d) => ({ ...d, exercises: d.exercises.map((e) => ({ ...e, sets: Math.max(1, e.sets - 1) })) })) });
      left -= 1;
    }
    n++;
  }
  return {
    request: r,
    plan: {
      title: `Rutina ${a.shortWeeks} semanas`.slice(0, 60),
      summary: `Rutina de ${r.weekdays.length} días por semana, ${a.minutes} min, nivel ${level}. Generada con tus respuestas y tus tests, sin IA.`,
      why: "Progresión lenta (≈10 % por semana), descarga cada 4 semanas y solo ejercicios con el material que tienes y sin cargar tus zonas con molestias.",
      phases,
    },
  };
}
