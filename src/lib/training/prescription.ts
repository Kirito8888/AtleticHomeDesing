// Prescripción de fuerza con evidencia abierta (v2.5b). Puro: lo usa el generador de rutinas y la vista del borrador.
// Cada pauta apunta a citas de `CITATIONS`; no hay umbrales personales (los datos de la atleta solo eligen la fila).
import type { Level } from "@/lib/routine/profile";

export type Citation = { id: string; authors: string; year: number; title: string; journal: string; doi: string };

/**
 * Referencias de las pautas. El enlace público es siempre https://doi.org/<doi> (ver `doiUrl`).
 * Resúmenes de consenso y metaanálisis; no son recomendaciones individuales ni sustituyen a un profesional.
 */
export const CITATIONS: Citation[] = [
  { id: "acsm2009", authors: "American College of Sports Medicine", year: 2009, title: "Progression models in resistance training for healthy adults", journal: "Med Sci Sports Exerc 41(3):687-708", doi: "10.1249/MSS.0b013e3181915670" },
  { id: "garber2011", authors: "Garber CE, et al.", year: 2011, title: "Quantity and quality of exercise for developing and maintaining cardiorespiratory, musculoskeletal, and neuromotor fitness in apparently healthy adults", journal: "Med Sci Sports Exerc 43(7):1334-1359", doi: "10.1249/MSS.0b013e318213fefb" },
  { id: "schoenfeld2017", authors: "Schoenfeld BJ, Ogborn D, Krieger JW", year: 2017, title: "Dose-response relationship between weekly resistance training volume and increases in muscle mass: a systematic review and meta-analysis", journal: "J Sports Sci 35(11):1073-1082", doi: "10.1080/02640414.2016.1210197" },
  { id: "ralston2017", authors: "Ralston GW, Kilgore L, Wyatt FB, Baker JS", year: 2017, title: "The effect of weekly set volume on strength gain: a meta-analysis", journal: "Sports Med 47(12):2585-2601", doi: "10.1007/s40279-017-0762-7" },
  { id: "bazvalle2022", authors: "Baz-Valle E, Balsalobre-Fernández C, Alix-Fages C, Santos-Concejero J", year: 2022, title: "A systematic review of the effects of different resistance training volumes on muscle hypertrophy", journal: "J Hum Kinet 81:199-210", doi: "10.2478/hukin-2022-0017" },
  { id: "schoenfeld2021", authors: "Schoenfeld BJ, Grgic J, Van Every DW, Plotkin DL", year: 2021, title: "Loading recommendations for muscle strength, hypertrophy, and local endurance: a re-examination of the repetition continuum", journal: "Sports 9(2):32", doi: "10.3390/sports9020032" },
  { id: "helms2016", authors: "Helms ER, Cronin J, Storey A, Zourdos MC", year: 2016, title: "Application of the repetitions in reserve-based rating of perceived exertion scale for resistance training", journal: "Strength Cond J 38(4):42-49", doi: "10.1519/SSC.0000000000000218" },
  { id: "refalo2023", authors: "Refalo MC, Helms ER, Trexler ET, Hamilton DL, Fyfe JJ", year: 2023, title: "Influence of resistance training proximity-to-failure on skeletal muscle hypertrophy: a systematic review with meta-analysis", journal: "Sports Med 53(3):649-665", doi: "10.1007/s40279-022-01784-y" },
  { id: "grgic2018", authors: "Grgic J, Schoenfeld BJ, Skrepnik M, Davies TB, Mikulic P", year: 2018, title: "Effects of rest interval duration in resistance training on measures of muscular strength: a systematic review", journal: "Sports Med 48(1):137-151", doi: "10.1007/s40279-017-0788-x" },
  { id: "schoenfeld2016", authors: "Schoenfeld BJ, Pope ZK, Benik FM, et al.", year: 2016, title: "Longer interset rest periods enhance muscle strength and hypertrophy in resistance-trained men", journal: "J Strength Cond Res 30(7):1805-1812", doi: "10.1519/JSC.0000000000001272" },
];

const BY_ID = new Map(CITATIONS.map((c) => [c.id, c]));
export const doiUrl = (c: Pick<Citation, "doi">) => `https://doi.org/${c.doi}`;
/** Resuelve ids guardados en el plan; los desconocidos se ignoran (la cita pudo retirarse). */
export function citationsFor(refs: string[]): Citation[] {
  return [...new Set(refs)].flatMap((id) => (BY_ID.has(id) ? [BY_ID.get(id)!] : []));
}
export const formatCitation = (c: Citation) => `${c.authors} (${c.year}). ${c.title}. ${c.journal}. doi:${c.doi}`;

export type PrescriptionGoal = "fuerza" | "hipertrofia" | "resistencia_muscular";
export type Range = readonly [number, number];
export type Rule = { weeklySets: Range; reps: Range; rir: string; restSec: number; refs: string[] };

const R_VOL = ["schoenfeld2017", "ralston2017", "bazvalle2022"];
/** Series semanales por grupo muscular, repeticiones, esfuerzo (RIR) y descanso entre series, por objetivo y nivel. */
export const PRESCRIPTION: Record<PrescriptionGoal, Record<Level, Rule>> = {
  // Fuerza: cargas más altas y descansos largos (ACSM 2009; Grgic 2018); el volumen suma con rendimientos decrecientes (Ralston 2017).
  fuerza: {
    principiante: { weeklySets: [4, 8], reps: [8, 12], rir: "RIR 3", restSec: 120, refs: ["acsm2009", "ralston2017", "helms2016", "grgic2018"] },
    intermedio: { weeklySets: [6, 12], reps: [6, 8], rir: "RIR 2", restSec: 150, refs: ["acsm2009", "ralston2017", "schoenfeld2021", "grgic2018", "helms2016"] },
    avanzado: { weeklySets: [8, 16], reps: [3, 6], rir: "RIR 1-2", restSec: 180, refs: ["acsm2009", "ralston2017", "schoenfeld2021", "grgic2018", "helms2016"] },
  },
  // Hipertrofia/salud general: ≥10 series semanales por grupo dan más masa muscular (Schoenfeld 2017); cerca del fallo, pero sin llegar (Refalo 2023).
  hipertrofia: {
    principiante: { weeklySets: [6, 10], reps: [8, 12], rir: "RIR 3", restSec: 90, refs: [...R_VOL, "acsm2009", "helms2016"] },
    intermedio: { weeklySets: [10, 16], reps: [6, 12], rir: "RIR 2", restSec: 120, refs: [...R_VOL, "refalo2023", "schoenfeld2016", "schoenfeld2021"] },
    avanzado: { weeklySets: [12, 20], reps: [6, 12], rir: "RIR 1-2", restSec: 120, refs: [...R_VOL, "refalo2023", "schoenfeld2016", "schoenfeld2021"] },
  },
  // Resistencia muscular local: muchas repeticiones con cargas ligeras y descansos cortos (ACSM 2009; Schoenfeld 2021).
  resistencia_muscular: {
    principiante: { weeklySets: [4, 8], reps: [12, 15], rir: "RIR 3", restSec: 60, refs: ["acsm2009", "schoenfeld2021", "helms2016"] },
    intermedio: { weeklySets: [6, 10], reps: [15, 20], rir: "RIR 3", restSec: 60, refs: ["acsm2009", "schoenfeld2021", "helms2016"] },
    avanzado: { weeklySets: [8, 12], reps: [15, 20], rir: "RIR 2", restSec: 45, refs: ["acsm2009", "schoenfeld2021", "helms2016"] },
  },
};

/** Cardio, movilidad, equilibrio y planchas: pautas de Garber 2011 / ACSM 2009 (no son series de fuerza). */
export const SUPPORT_REFS = ["garber2011"];

export const prescribe = (goal: PrescriptionGoal, level: Level): Rule => PRESCRIPTION[goal][level];
export const MIN_SETS = 2;
export const MAX_SETS = 5;

/** Series de cada ejercicio para llegar al mínimo semanal del grupo, repartido entre las veces que se trabaja esa semana. */
export function setsPerExercise(rule: Rule, timesPerWeek: number): number {
  const target = rule.weeklySets[0] / Math.max(1, timesPerWeek);
  return Math.min(MAX_SETS, Math.max(MIN_SETS, Math.round(target)));
}

export const restLabel = (sec: number) => (sec >= 120 && sec % 60 === 0 ? `${sec / 60} min` : sec >= 120 ? `${String(Math.round(sec / 6) / 10).replace(".", ",")} min` : `${sec} s`);
const repsLabel = (r: Range) => `${r[0]}-${r[1]}`;
export const repsText = (rule: Rule) => repsLabel(rule.reps);
export const rirText = (rule: Rule) => (rule.rir === "RIR 3" ? "RIR 3 (te sobran 3 repeticiones)" : rule.rir);

export type Basis = { why: string; refs: string[] };

/** Justificación en castellano llano de la dosis de un ejercicio de fuerza. */
export function basisFor(goal: PrescriptionGoal, level: Level, o: { group: string; timesPerWeek: number; sets: number; trimmed?: boolean }): Basis {
  const r = prescribe(goal, level);
  const volume = `Se orienta a ${repsLabel(r.weeklySets)} series semanales por grupo muscular (${o.group}); trabajas el grupo ${o.timesPerWeek} ${o.timesPerWeek === 1 ? "vez" : "veces"} por semana y se empieza con ${o.sets} series por ejercicio (la progresión de las semanas siguientes puede subirlas).`;
  const trim = o.trimmed ? " Se ha dejado el mínimo de series para que quepa en el tiempo que indicaste." : "";
  const intensity = `${repsLabel(r.reps)} repeticiones con ${r.rir} (repeticiones que te sobran) y ${restLabel(r.restSec)} de descanso, pauta habitual para ${goal === "fuerza" ? "ganar fuerza" : goal === "hipertrofia" ? "ganar masa muscular y salud general" : "resistencia muscular"} a nivel ${level}.`;
  return { why: `${volume}${trim} ${intensity}`, refs: r.refs };
}

/** Series iniciales de una fila («3 × 8-12» → 3); null si no empieza por un número. */
export const setsOfRow = (sets: string): number | null => {
  const m = /^\s*(\d{1,2})\s*[×x]/i.exec(sets);
  return m ? Number(m[1]) : null;
};

/**
 * Tras editar las series de una fila, el texto de «Por qué» dice las nuevas y deja de afirmar que se recortó por tiempo.
 * Las citas no cambian. Si el texto no tiene la frase de las series (planes de apoyo: cardio, planchas), se devuelve igual.
 */
export function rebaseBasis(basis: Basis, sets: number): Basis {
  const why = basis.why.replace(/se empieza con \d+ series? por ejercicio/, `se empieza con ${sets} ${sets === 1 ? "serie" : "series"} por ejercicio`);
  return why === basis.why ? basis : { ...basis, why: why.replace(/ Se ha dejado el mínimo de series para que quepa en el tiempo que indicaste\./, "") };
}

/** Justificación de planchas, movilidad, equilibrio y cardio. */
export function supportBasis(kind: "cardio" | "hold"): Basis {
  return {
    why: kind === "cardio" ? "Cardio de intensidad moderada, en minutos y con esfuerzo que permite hablar: pauta general para adultos sanos." : "Trabajo de control, movilidad y equilibrio en tandas cortas y a tu ritmo: pauta general de ejercicio neuromotor para adultos.",
    refs: SUPPORT_REFS,
  };
}

export function goalFor(shortGoal: string): PrescriptionGoal {
  return shortGoal === "fuerza" ? "fuerza" : shortGoal === "resistencia" || shortGoal === "correr_5k" ? "resistencia_muscular" : "hipertrofia";
}
