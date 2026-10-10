import { z } from "zod";

import { type CycleLogEntry, cyclePhase, type CycleSettings, periodStarts } from "./cycle";

/**
 * Salud de la mujer deportista (puro, sin IA). Son herramientas de cribado y
 * prudencia, no diagnósticos: cada aviso remite a una valoración profesional.
 */

const DAY = 864e5;
const ms = (iso: string) => Date.parse(`${iso}T00:00:00Z`);
const iso = (t: number) => new Date(t).toISOString().slice(0, 10);
const daysBetween = (a: string, b: string) => Math.round((ms(a) - ms(b)) / DAY);
const r1 = (n: number) => Math.round(n * 10) / 10;

export type HealthAlert = { id: string; level: "warn" | "info"; title: string; message: string };

// ---------------------------------------------------------------------------
// Ajustes (cifrados en WomenHealth)
// ---------------------------------------------------------------------------
export const womenSettingsSchema = z.object({
  /** Embarazo o posparto: cambia lo que la app propone. */
  mode: z.enum(["NONE", "PREGNANT", "POSTPARTUM"]).default("NONE"),
  /** Fecha del parto (posparto). */
  postpartumSince: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().default(null),
  /** Alta de su médica o matrona para empezar la vuelta al entrenamiento. */
  cleared: z.boolean().default(false),
  /** Criterios de la vuelta posparto ya superados (claves de PP_CRITERIA). */
  ppDone: z.array(z.string().max(40)).max(40).default([]),
  /** Disponibilidad energética: aviso por debajo de (kcal/kg de masa libre de grasa/día). */
  eaMin: z.number().min(15).max(45).default(30),
  /** Ferritina: aviso por debajo de (µg/L). Editable: los umbrales varían según la guía. */
  ferritinMin: z.number().min(5).max(200).default(30),
  /** Recordar una analítica cada N meses (null = no recordar). */
  labEveryMonths: z.number().int().min(1).max(24).nullable().default(6),
  /** Recordatorio suave para registrar la regla si lleva tiempo sin datos. */
  remindPeriod: z.boolean().default(false),
  // v1.6
  /** Predicción aprendida: un día del ciclo cuenta como «con síntomas» si los tuvo en al menos esta proporción de ciclos. */
  symptomProbMin: z.number().min(0.2).max(1).default(0.5),
  /** Salud ósea: raciones de lácteos o equivalentes en calcio al día, vitamina D mínima (ng/mL) y sesiones con impacto a la semana. */
  calciumMin: z.number().min(0).max(8).default(3),
  vitDMin: z.number().min(5).max(100).default(30),
  boneImpactMin: z.number().int().min(0).max(14).default(2),
  /** Recordatorio semanal si no hubo trabajo con impacto. */
  remindImpact: z.boolean().default(false),
  // v1.7
  /** Anticoncepción (cambia cómo se leen el ciclo y el patrón ciclo–rendimiento). */
  contraception: z.enum(["NONE", "PILL_COMBINED", "PILL_PROGESTIN", "IUD_HORMONAL", "IUD_COPPER", "IMPLANT", "RING_PATCH", "INJECTION", "OTHER"]).default("NONE"),
  contraceptionSince: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().default(null),
  /** Etapa: perimenopausia o menopausia (cambia avisos y recomendaciones). */
  menopause: z.enum(["NONE", "PERI", "POST"]).default("NONE"),
});
export type WomenSettings = z.infer<typeof womenSettingsSchema>;
export const readWomenSettings = (raw: unknown): WomenSettings => {
  const r = womenSettingsSchema.safeParse(raw ?? {});
  return r.success ? r.data : womenSettingsSchema.parse({});
};

// ---------------------------------------------------------------------------
// Registros (cifrados en HealthLog: el tipo también va dentro)
// ---------------------------------------------------------------------------
export const SCREEN_QUESTIONS = {
  amenorrhea: { text: "¿Se te ha retirado la regla más de 3 meses seguidos (sin embarazo ni anticonceptivo)?", red: true },
  stressFracture: { text: "¿Has tenido una fractura por estrés en los últimos 2 años?", red: true },
  irregular: { text: "¿Tus ciclos son irregulares o más largos de 35 días?", red: false },
  injuries: { text: "¿Has tenido 2 o más lesiones que te obligaron a parar en el último año?", red: false },
  gut: { text: "¿Tienes hinchazón, calambres o digestiones pesadas casi todas las semanas?", red: false },
  weightLoss: { text: "¿Has perdido peso sin buscarlo en los últimos meses?", red: false },
  fatigue: { text: "¿Te sientes sin energía o rindes menos aunque descanses?", red: false },
  restrict: { text: "¿Limitas lo que comes para controlar el peso o la figura?", red: false },
} as const;
export type ScreenKey = keyof typeof SCREEN_QUESTIONS;

export const LAB_MARKERS = {
  ferritin: { label: "Ferritina", unit: "µg/L" },
  hemoglobin: { label: "Hemoglobina", unit: "g/dL" },
  vitaminD: { label: "Vitamina D (25-OH)", unit: "ng/mL" },
  transferrinSat: { label: "Saturación de transferrina", unit: "%" },
} as const;
export type LabMarker = keyof typeof LAB_MARKERS;

export const PELVIC_SYMPTOMS = {
  leakJump: "Pérdidas de orina al saltar",
  leakRun: "Pérdidas de orina al correr",
  leakThrow: "Pérdidas de orina al lanzar o hacer fuerza",
  heaviness: "Pesadez o presión en la zona pélvica",
  pain: "Dolor pélvico",
} as const;
export type PelvicSymptom = keyof typeof PELVIC_SYMPTOMS;

// v1.7 · Anticoncepción y menopausia
export const CONTRACEPTION = {
  NONE: "Ninguna / no hormonal",
  PILL_COMBINED: "Píldora combinada",
  PILL_PROGESTIN: "Píldora solo de progestágeno",
  IUD_HORMONAL: "DIU hormonal",
  IUD_COPPER: "DIU de cobre",
  IMPLANT: "Implante",
  RING_PATCH: "Anillo o parche",
  INJECTION: "Inyección",
  OTHER: "Otra",
} as const;
export type Contraception = keyof typeof CONTRACEPTION;

/** Qué cambia en tus datos según la anticoncepción (orientativo; no sustituye a tu ginecóloga). */
export function contraceptionNote(c: Contraception): string | null {
  if (c === "PILL_COMBINED" || c === "RING_PATCH")
    return "Con anticoncepción hormonal combinada no hay un ciclo natural: la «regla» de la semana de descanso es un sangrado por deprivación. La predicción y el patrón ciclo–rendimiento comparan días con y sin síntomas, no fases.";
  if (c === "PILL_PROGESTIN" || c === "IUD_HORMONAL" || c === "IMPLANT" || c === "INJECTION")
    return "Con progestágeno el sangrado puede ser irregular o desaparecer: la regla ausente no es una señal de alarma por sí sola mientras lo uses, pero sí el resto del cribado de RED-S.";
  if (c === "IUD_COPPER") return "El DIU de cobre no cambia tus hormonas: tu ciclo es natural, aunque las reglas pueden ser más abundantes (vigila la ferritina).";
  return null;
}

export const MENO_SYMPTOMS = {
  hotFlashes: "Sofocos",
  nightSweats: "Sudores nocturnos",
  sleep: "Duermo peor",
  jointPain: "Dolor articular",
  mood: "Cambios de ánimo",
  irregular: "Reglas irregulares",
} as const;
export type MenoSymptom = keyof typeof MENO_SYMPTOMS;

/** Pautas para la peri y posmenopausia (prudencia, no tratamiento). */
export function menopauseTips(stage: "NONE" | "PERI" | "POST"): string[] {
  if (stage === "NONE") return [];
  return [
    "Fuerza 2-3 días por semana con cargas que cuesten: es lo que mejor protege músculo y hueso.",
    "Algo de impacto (saltos suaves, carrera, lanzamientos) si no hay contraindicación: el hueso responde al impacto.",
    "Proteína suficiente en cada comida (≈ 1,2-1,6 g/kg/día) y calcio y vitamina D según tu analítica.",
    "Si los sofocos o el sueño te quitan el descanso, habla con tu médica: hay opciones de tratamiento.",
    ...(stage === "PERI" ? ["Las reglas pueden volverse irregulares: la predicción del ciclo será menos fiable."] : []),
  ];
}

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
export const healthLogSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("SCREEN"), date: isoDate, answers: z.partialRecord(z.enum(Object.keys(SCREEN_QUESTIONS) as [ScreenKey, ...ScreenKey[]]), z.boolean()) }),
  z.object({
    kind: z.literal("LAB"),
    date: isoDate,
    values: z.partialRecord(z.enum(Object.keys(LAB_MARKERS) as [LabMarker, ...LabMarker[]]), z.number().min(0).max(10_000)),
    note: z.string().max(200).nullish(),
  }),
  z.object({ kind: z.literal("PELVIC"), date: isoDate, symptoms: z.array(z.enum(Object.keys(PELVIC_SYMPTOMS) as [PelvicSymptom, ...PelvicSymptom[]])).min(1).max(5) }),
  z.object({ kind: z.literal("PILL_BREAK"), date: isoDate, days: z.number().int().min(1).max(10) }),
  // v1.6: cribado de salud ósea (fracturas de estrés previas y raciones de calcio al día)
  z.object({ kind: z.literal("BONE"), date: isoDate, stressFractures: z.number().int().min(0).max(20), calciumServings: z.number().min(0).max(10) }),
  // v1.7: síntomas de la peri y posmenopausia
  z.object({ kind: z.literal("MENO"), date: isoDate, symptoms: z.array(z.enum(Object.keys(MENO_SYMPTOMS) as [MenoSymptom, ...MenoSymptom[]])).min(1).max(6) }),
]);
export type HealthLogEntry = z.infer<typeof healthLogSchema>;

// ---------------------------------------------------------------------------
// 1. Disponibilidad energética (EA) y cribado de RED-S
// ---------------------------------------------------------------------------
const DEFAULT_RPE: Record<string, number> = { STRENGTH: 6, TECHNICAL: 5, TRACK: 6, MIXED: 6 };

/**
 * Gasto del ejercicio (kcal) estimado: MET ≈ 2 + 0,8 × RPE (entre 3 y 11) × kg × horas.
 * Es una estimación gruesa; por eso la EA se da como media de varios días.
 */
export function exerciseKcal(s: { durationSec: number | null; sessionRpe: number | null; type: string }, weightKg: number): number {
  if (!s.durationSec) return 0;
  const rpe = s.sessionRpe ?? DEFAULT_RPE[s.type] ?? 5;
  const met = Math.min(11, Math.max(3, 2 + 0.8 * rpe));
  // Se resta el gasto en reposo (1 MET) que ya cuenta en el día
  return Math.round((met - 1) * weightKg * (s.durationSec / 3600));
}

export type EaDay = { date: string; intakeKcal: number | null; exerciseKcal: number };
export type EaResult =
  | { ok: true; ffmKg: number; mean: number; days: Array<{ date: string; ea: number }>; low: boolean }
  | { ok: false; reason: string };

/** EA = (ingesta − ejercicio) / masa libre de grasa. Media de los días con comida registrada (≥ 4 de 7). */
export function energyAvailability(days: EaDay[], weightKg: number | null, fatPct: number | null, threshold: number): EaResult {
  if (!weightKg || fatPct == null) return { ok: false, reason: "Faltan el peso y el % de grasa (Recuperación → Control rápido) para calcular la masa libre de grasa." };
  const ffmKg = weightKg * (1 - fatPct / 100);
  const logged = days.filter((d) => d.intakeKcal != null && d.intakeKcal > 300);
  if (logged.length < 4) return { ok: false, reason: `Registra la comida de al menos 4 de los últimos 7 días (llevas ${logged.length}).` };
  const list = logged.map((d) => ({ date: d.date, ea: r1((d.intakeKcal! - d.exerciseKcal) / ffmKg) }));
  const mean = r1(list.reduce((a, d) => a + d.ea, 0) / list.length);
  return { ok: true, ffmKg: r1(ffmKg), mean, days: list, low: mean < threshold };
}

export type ScreenResult = { red: ScreenKey[]; amber: ScreenKey[]; level: "red" | "amber" | "ok" };
/** Cribado orientativo (dominios del LEAF-Q: lesiones, digestión y función menstrual). No es el cuestionario validado. */
export function screenResult(answers: Partial<Record<ScreenKey, boolean>>): ScreenResult {
  const yes = (Object.keys(answers) as ScreenKey[]).filter((k) => answers[k]);
  const red = yes.filter((k) => SCREEN_QUESTIONS[k].red);
  const amber = yes.filter((k) => !SCREEN_QUESTIONS[k].red);
  return { red, amber, level: red.length ? "red" : amber.length >= 2 ? "amber" : "ok" };
}

// ---------------------------------------------------------------------------
// 2. Regla ausente o irregular
// ---------------------------------------------------------------------------
export function periodAlerts(settings: CycleSettings | null, logs: CycleLogEntry[], today: string): HealthAlert[] {
  if (!settings || settings.hormonal === "si") return [];
  const starts = periodStarts(settings, logs).filter((d) => d <= today);
  if (!starts.length) return [];
  const out: HealthAlert[] = [];
  const since = daysBetween(today, starts.at(-1)!);
  if (since > 90) {
    out.push({
      id: "amenorrhea",
      level: "warn",
      title: `${since} días sin regla registrada`,
      message: "Si de verdad no te ha venido (y no hay embarazo), en deportistas puede deberse a comer poco para lo que entrenas. Pide cita con tu médica; mientras, no recortes comida.",
    });
  }
  const gaps = starts.slice(1).map((d, i) => daysBetween(d, starts[i]));
  if (gaps.length >= 2 && gaps.slice(-2).every((g) => g > 35)) {
    out.push({
      id: "long-cycles",
      level: "info",
      title: "Ciclos de más de 35 días",
      message: `Los dos últimos duraron ${gaps.slice(-2).join(" y ")} días. Coméntalo en tu próxima revisión médica, sobre todo si coincide con más carga o menos comida.`,
    });
  }
  return out;
}

// ---------------------------------------------------------------------------
// 3. Analíticas
// ---------------------------------------------------------------------------
type Lab = Extract<HealthLogEntry, { kind: "LAB" }>;
export function labSeries(labs: Lab[]): Record<LabMarker, Array<{ date: string; value: number }>> {
  const out = Object.fromEntries(Object.keys(LAB_MARKERS).map((k) => [k, [] as Array<{ date: string; value: number }>])) as Record<LabMarker, Array<{ date: string; value: number }>>;
  for (const l of [...labs].sort((a, b) => (a.date < b.date ? -1 : 1))) {
    for (const [k, v] of Object.entries(l.values) as Array<[LabMarker, number]>) out[k].push({ date: l.date, value: v });
  }
  return out;
}

export function labAlerts(labs: Lab[], s: Pick<WomenSettings, "ferritinMin" | "labEveryMonths">, today: string): HealthAlert[] {
  const out: HealthAlert[] = [];
  const series = labSeries(labs);
  const fer = series.ferritin.at(-1);
  if (fer && fer.value < s.ferritinMin) {
    out.push({
      id: "ferritin",
      level: "warn",
      title: `Ferritina ${fer.value} µg/L (${fer.date})`,
      message: `Por debajo de tu umbral (${s.ferritinMin}). Coméntalo con tu médica antes de tomar hierro por tu cuenta: la dosis y el tipo los decide ella.`,
    });
  }
  const last = [...labs].sort((a, b) => (a.date < b.date ? 1 : -1))[0];
  if (s.labEveryMonths && last) {
    const due = new Date(ms(last.date));
    due.setUTCMonth(due.getUTCMonth() + s.labEveryMonths);
    if (iso(due.getTime()) <= today) {
      out.push({ id: "lab-due", level: "info", title: "Toca analítica", message: `La última fue el ${last.date}. Pide una que incluya hemograma y ferritina.` });
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// 4. Suelo pélvico
// ---------------------------------------------------------------------------
type Pelvic = Extract<HealthLogEntry, { kind: "PELVIC" }>;
export function pelvicAlert(logs: Pelvic[], today: string): HealthAlert | null {
  const recent = logs.filter((l) => daysBetween(today, l.date) >= 0 && daysBetween(today, l.date) < 7);
  if (!recent.length) return null;
  const syms = [...new Set(recent.flatMap((l) => l.symptoms))];
  return {
    id: "pelvic",
    level: "warn",
    title: "Síntomas de suelo pélvico esta semana",
    message: `${syms.map((s) => PELVIC_SYMPTOMS[s]).join(", ")}. Esta semana, menos impactos (saltos y multisaltos, carrera rápida) y mete la rutina de suelo pélvico en el calentamiento. Si se repite, pide valoración con fisioterapia de suelo pélvico: es frecuente en deportistas de impacto y tiene tratamiento.`,
  };
}

/** Rutina de activación del suelo pélvico (para el calentamiento o el plan). */
export const PELVIC_ROUTINE = [
  { exercise: "Respiración diafragmática con contracción del suelo pélvico al soltar el aire", sets: "2 × 8", how: "Tumbada, rodillas flexionadas. Contrae 3 s al soltar el aire y suelta del todo al cogerlo." },
  { exercise: "Contracciones rápidas del suelo pélvico", sets: "2 × 10", how: "Contrae y suelta rápido, sin apretar glúteos ni abdomen." },
  { exercise: "Puente de glúteo con contracción", sets: "2 × 10", how: "Contrae el suelo pélvico antes de subir la cadera." },
  { exercise: "Sentadilla con contracción en la subida", sets: "2 × 8", how: "Activa al subir, como si cortaras el pis." },
  { exercise: "Saltos suaves en el sitio con contracción previa", sets: "2 × 10", how: "Solo si no hay pérdidas ni pesadez; si aparecen, para." },
];

// ---------------------------------------------------------------------------
// 5. Posparto: vuelta al entrenamiento por fases (Goom, Donnelly y Brockwell 2019)
// ---------------------------------------------------------------------------
export const PP_PHASES = [
  {
    key: "recovery",
    title: "0–6 semanas: recuperación",
    minWeeks: 0,
    advice: "Paseos cortos, respiración y suelo pélvico. Nada de impacto ni de cargas.",
    criteria: [{ key: "cleared", text: "Tengo el alta de mi médica o matrona para empezar a entrenar" }],
  },
  {
    key: "base",
    title: "6–12 semanas: fuerza de base sin impacto",
    minWeeks: 6,
    advice: "Fuerza con cargas ligeras y moderadas, bici o elíptica. Sin saltos ni carrera.",
    criteria: [
      { key: "walk30", text: "Camino 30 minutos sin síntomas" },
      { key: "balance", text: "Me sostengo 10 s a una pierna (cada lado)" },
      { key: "squat1", text: "10 sentadillas a una pierna por lado sin síntomas" },
    ],
  },
  {
    key: "impact",
    title: "≥ 12 semanas: impacto progresivo",
    minWeeks: 12,
    advice: "Tests de impacto antes de volver a correr. Si aparecen pérdidas, pesadez o dolor, vuelve a la fase anterior y consulta con fisioterapia de suelo pélvico.",
    criteria: [
      { key: "jog", text: "Trote en el sitio 1 minuto sin síntomas" },
      { key: "bounds", text: "10 saltos hacia delante sin síntomas" },
      { key: "hops", text: "10 saltos a una pierna por lado sin síntomas" },
      { key: "runningMan", text: "10 «running man» a una pierna por lado sin síntomas" },
    ],
  },
  {
    key: "return",
    title: "Vuelta a carrera y lanzamientos",
    minWeeks: 12,
    advice: "Carrera y lanzamientos progresivos (empieza con pocos lanzamientos desde parado). Sube volumen antes que intensidad.",
    criteria: [],
  },
] as const;

export type PostpartumStatus = { weeks: number; phase: number; title: string; advice: string; next: { text: string; key: string; done: boolean }[]; blockedBy: "time" | "criteria" | null };

export function postpartumStatus(s: Pick<WomenSettings, "postpartumSince" | "cleared" | "ppDone">, today: string): PostpartumStatus | null {
  if (!s.postpartumSince) return null;
  const weeks = Math.floor(daysBetween(today, s.postpartumSince) / 7);
  const done = new Set([...s.ppDone, ...(s.cleared ? ["cleared"] : [])]);
  let phase = 0;
  while (phase < PP_PHASES.length - 1) {
    const cur = PP_PHASES[phase];
    const next = PP_PHASES[phase + 1];
    if (!cur.criteria.every((c) => done.has(c.key)) || weeks < next.minWeeks) break;
    phase++;
  }
  const cur = PP_PHASES[phase];
  const nextPhase = PP_PHASES[phase + 1];
  const pending = cur.criteria.filter((c) => !done.has(c.key));
  return {
    weeks,
    phase,
    title: cur.title,
    advice: cur.advice,
    next: cur.criteria.map((c) => ({ key: c.key, text: c.text, done: done.has(c.key) })),
    blockedBy: !nextPhase ? null : pending.length ? "criteria" : weeks < nextPhase.minWeeks ? "time" : null,
  };
}

// ---------------------------------------------------------------------------
// 6. El ciclo en la planificación
// ---------------------------------------------------------------------------
export type PredictedDay = { date: string; period: boolean; symptoms: boolean };

/** Días previstos de regla y de síntomas habituales entre from y to (estimación local). */
export function predictedDays(
  settings: CycleSettings | null,
  logs: CycleLogEntry[],
  from: string,
  to: string,
  /** v1.6: días con síntomas aprendidos de sus ciclos (sustituyen a «suelo encontrarme peor en…»). */
  learned: Array<{ date: string }> | null = null,
): PredictedDay[] {
  if (!settings || settings.hormonal === "si") return [];
  const learnedSet = learned ? new Set(learned.map((l) => l.date)) : null;
  const out: PredictedDay[] = [];
  for (let t = ms(from); t <= ms(to); t += DAY) {
    const date = iso(t);
    const { part } = cyclePhase(date, settings, logs);
    if (!part) continue;
    const period = part === "regla";
    const symptoms = learnedSet
      ? learnedSet.has(date)
      : (part === "regla" && settings.symptomParts.includes("regla")) ||
      (part === "antes" && settings.symptomParts.includes("antes")) ||
      (part === "ovulacion" && settings.symptomParts.includes("ovulacion"));
    if (period || symptoms) out.push({ date, period, symptoms });
  }
  return out;
}

/** Sesión clave (test, competición, serie de test) en un día previsto con síntomas → sugerencia de moverla. */
const KEY_SESSION = /\b(test|rm|competici|control|campeonato|serie de test|toma de marca)/i;
export function keySessionClashes(days: PredictedDay[], items: Array<{ id: string; date: string; title: string; kind: "session" | "event"; eventType?: string }>) {
  const bad = new Set(days.filter((d) => d.symptoms).map((d) => d.date));
  return items.filter((i) => bad.has(i.date) && (i.kind === "event" ? ["COMPETITION", "TEST_1RM", "TIME_TRIAL"].includes(i.eventType ?? "") : KEY_SESSION.test(i.title)));
}
