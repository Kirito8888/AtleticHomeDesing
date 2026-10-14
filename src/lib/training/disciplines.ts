// v2.1 · Disciplinas y métricas por especialidad. Puro (sin servidor ni BD).
// Los cálculos de lanzamientos (tonelaje, TSS, mejor marca) no pasan por aquí: esto solo elige qué mostrar.
import { formatNum, formatPace, TECHNICAL_EVENT_LABEL } from "@/lib/format";

export type Family = "throws" | "jumps" | "sprint" | "endurance" | "combined" | "other";
export type DisciplineKey =
  | "SPRINT" | "MIDDLE_DISTANCE" | "LONG_DISTANCE" | "HURDLES" | "JUMPS" | "THROWS" | "COMBINED_EVENTS"
  | "SWIMMING" | "CYCLING" | "STRENGTH" | "OTHER";

export interface EventInfo {
  label: string;
  discipline: DisciplineKey;
  family: Family;
  distanceM?: number;
  /** Prueba técnica que se preselecciona (saltos y lanzamientos). */
  technical?: string;
  /** Modalidad de pista que se preselecciona. */
  modality?: "SPRINT" | "HURDLES" | "RUN";
}

const sprint = (label: string, distanceM: number): EventInfo => ({ label, discipline: "SPRINT", family: "sprint", distanceM, modality: "SPRINT" });
const hurdles = (label: string, distanceM: number): EventInfo => ({ label, discipline: "HURDLES", family: "sprint", distanceM, modality: "HURDLES" });
const middle = (label: string, distanceM: number): EventInfo => ({ label, discipline: "MIDDLE_DISTANCE", family: "endurance", distanceM, modality: "RUN" });
const long = (label: string, distanceM: number): EventInfo => ({ label, discipline: "LONG_DISTANCE", family: "endurance", distanceM, modality: "RUN" });
const jump = (label: string, technical: string): EventInfo => ({ label, discipline: "JUMPS", family: "jumps", technical });
const thr = (label: string, technical: string): EventInfo => ({ label, discipline: "THROWS", family: "throws", technical });
const comb = (label: string): EventInfo => ({ label, discipline: "COMBINED_EVENTS", family: "combined", modality: "SPRINT" });

/** Catálogo de especialidades. Las claves se guardan en `AthleteProfile.primaryEvent` (texto: ampliable sin migrar). */
export const EVENTS: Record<string, EventInfo> = {
  "60m": sprint("60 m", 60),
  "100m": sprint("100 m", 100),
  "200m": sprint("200 m", 200),
  "400m": sprint("400 m", 400),
  "60mv": hurdles("60 m vallas", 60),
  "100mv": hurdles("100 m vallas", 100),
  "110mv": hurdles("110 m vallas", 110),
  "400mv": hurdles("400 m vallas", 400),
  "800m": middle("800 m", 800),
  "1500m": middle("1500 m", 1500),
  "3000obs": middle("3000 m obstáculos", 3000),
  "5000m": long("5000 m", 5000),
  "10000m": long("10 000 m", 10000),
  media: long("Media maratón", 21097),
  maraton: long("Maratón", 42195),
  longitud: jump("Longitud", "LONG_JUMP"),
  triple: jump("Triple salto", "TRIPLE_JUMP"),
  altura: jump("Altura", "HIGH_JUMP"),
  pertiga: jump("Pértiga", "POLE_VAULT"),
  heptatlon: comb("Heptatlón"),
  decatlon: comb("Decatlón"),
  pentatlon: comb("Pentatlón en pista cubierta"),
  jabalina: thr("Jabalina", "JAVELIN"),
  peso: thr("Peso", "SHOT_PUT"),
  disco: thr("Disco", "DISCUS"),
  martillo: thr("Martillo", "HAMMER"),
};

export const EVENT_KEYS = Object.keys(EVENTS) as [string, ...string[]];

const DISCIPLINE_FAMILY: Record<string, Family> = {
  SPRINT: "sprint", HURDLES: "sprint", MIDDLE_DISTANCE: "endurance", LONG_DISTANCE: "endurance",
  JUMPS: "jumps", THROWS: "throws", COMBINED_EVENTS: "combined",
};

/** Familia activa: manda la especialidad; luego la disciplina principal. Sin perfil → lanzamientos (comportamiento previo). */
export function familyOf(discipline?: string | null, primaryEvent?: string | null): Family {
  if (primaryEvent && EVENTS[primaryEvent]) return EVENTS[primaryEvent].family;
  if (discipline) return DISCIPLINE_FAMILY[discipline] ?? "other";
  return "throws";
}

export interface FormDefaults {
  type: "TRACK" | "TECHNICAL" | "STRENGTH" | null;
  modality: string | null;
  technicalEvent: string | null;
}

/** Valores iniciales del formulario de sesión. `null` = dejar los de siempre (usuarias de lanzamientos). */
export function defaultsFor(discipline?: string | null, primaryEvent?: string | null): FormDefaults {
  const ev = primaryEvent ? EVENTS[primaryEvent] : undefined;
  const family = familyOf(discipline, primaryEvent);
  if (family === "sprint" || family === "endurance" || family === "combined") {
    const modality = ev?.modality ?? (discipline === "HURDLES" ? "HURDLES" : discipline === "SPRINT" || discipline === "COMBINED_EVENTS" ? "SPRINT" : "RUN");
    return { type: "TRACK", modality, technicalEvent: null };
  }
  if (family === "jumps") return { type: "TECHNICAL", modality: null, technicalEvent: ev?.technical ?? "LONG_JUMP" };
  return { type: null, modality: null, technicalEvent: ev?.technical ?? null };
}

/** `discipline` que se guarda en una sesión de pista: la modalidad concreta si lo es, si no la del perfil. */
export function disciplineForTrack(modality: string, profileDiscipline?: string | null): string | null {
  if (modality === "SPRINT") return "SPRINT";
  if (modality === "HURDLES") return "HURDLES";
  if (modality === "SWIM") return "SWIMMING";
  if (modality === "CYCLE") return "CYCLING";
  if (modality === "RUN") return profileDiscipline === "MIDDLE_DISTANCE" || profileDiscipline === "LONG_DISTANCE" ? profileDiscipline : null;
  return null;
}

/** s/km a partir de metros y segundos. */
export const paceSecPerKm = (distanceM: number | null | undefined, timeSec: number | null | undefined) =>
  distanceM && timeSec && distanceM > 0 && timeSec > 0 ? timeSec / (distanceM / 1000) : null;

/** m/s a partir de metros y segundos. */
export const speedMs = (distanceM: number | null | undefined, timeSec: number | null | undefined) =>
  distanceM && timeSec && distanceM > 0 && timeSec > 0 ? distanceM / timeSec : null;

export interface IntervalLike {
  distanceM?: number | null;
  timeSec?: number | null;
}

export interface IntervalStats {
  count: number;
  totalM: number;
  totalTimeSec: number;
  avgPaceSecPerKm: number | null;
  /** Mejor (menor) tiempo entre las series de la distancia más repetida (la que se compara). */
  bestTimeSec: number | null;
  bestDistanceM: number | null;
  /** Todas las series miden lo mismo → «6×150 m». */
  uniformDistanceM: number | null;
}

export function intervalStats(intervals: IntervalLike[]): IntervalStats {
  const rows = intervals.filter((i) => (i.distanceM ?? 0) > 0 || (i.timeSec ?? 0) > 0);
  const timed = rows.filter((i) => (i.distanceM ?? 0) > 0 && (i.timeSec ?? 0) > 0);
  const totalM = rows.reduce((a, i) => a + (i.distanceM ?? 0), 0);
  const timedM = timed.reduce((a, i) => a + i.distanceM!, 0);
  const totalTimeSec = timed.reduce((a, i) => a + i.timeSec!, 0);
  const counts = new Map<number, number>();
  for (const i of timed) counts.set(i.distanceM!, (counts.get(i.distanceM!) ?? 0) + 1);
  let bestDistanceM: number | null = null;
  for (const [d, n] of counts) if (bestDistanceM == null || n > counts.get(bestDistanceM)! || (n === counts.get(bestDistanceM) && d > bestDistanceM)) bestDistanceM = d;
  const bestTimeSec = bestDistanceM == null ? null : Math.min(...timed.filter((i) => i.distanceM === bestDistanceM).map((i) => i.timeSec!));
  const dists = new Set(rows.map((i) => i.distanceM ?? 0));
  return {
    count: rows.length,
    totalM,
    totalTimeSec,
    avgPaceSecPerKm: paceSecPerKm(timedM, totalTimeSec),
    bestTimeSec,
    bestDistanceM,
    uniformDistanceM: dists.size === 1 && [...dists][0] > 0 ? [...dists][0] : null,
  };
}

/** 11,5 → «11,50 s»; 62,34 → «1:02,34». Las centésimas importan en velocidad. */
export function formatSeconds(sec: number): string {
  const c = Math.round(sec * 100);
  const m = Math.floor(c / 6000);
  const rest = ((c - m * 6000) / 100).toFixed(2).replace(".", ",");
  return m ? `${m}:${rest.padStart(5, "0")}` : `${rest} s`;
}

const km = (m: number) => `${formatNum(m / 1000, 2)} km`;

export interface HeadlineInput {
  technical?: { event: string; bestMarkM: number | null } | null;
  strength?: { tonnageKg: number | null; setCount: number } | null;
  track?: { modality: string; distanceM: number | null; avgPaceSecPerKm: number | null; avgPaceSecPer100m?: number | null; intervals?: IntervalLike[] } | null;
}

/**
 * Titular corto de una sesión para listas y calendario.
 * Lanzamientos y fuerza conservan el texto de siempre; pista añade series y marcas según la prueba.
 */
export function sessionHeadline(s: HeadlineInput): string {
  if (s.technical) {
    return `${TECHNICAL_EVENT_LABEL[s.technical.event] ?? s.technical.event}${s.technical.bestMarkM != null ? ` · ${formatNum(s.technical.bestMarkM, 2)} m` : ""}`;
  }
  if (s.strength) return `${s.strength.setCount} series · ${formatNum(s.strength.tonnageKg ?? 0, 1)} kg`;
  if (s.track) {
    const t = s.track;
    const st = intervalStats(t.intervals ?? []);
    const fast = t.modality === "SPRINT" || t.modality === "HURDLES";
    if (st.count > 0 && (fast || !t.distanceM)) {
      const base = st.uniformDistanceM ? `${st.count}×${formatNum(st.uniformDistanceM)} m` : `${st.count} series · ${formatNum(st.totalM)} m`;
      return st.bestTimeSec != null && st.bestDistanceM ? `${base} · mejor ${formatSeconds(st.bestTimeSec)}${st.uniformDistanceM ? "" : ` (${formatNum(st.bestDistanceM)} m)`}` : base;
    }
    // Comportamiento previo de «pista»: distancia y ritmo
    return `${t.distanceM ? km(t.distanceM) : ""}${t.avgPaceSecPerKm ? ` · ${formatPace(t.avgPaceSecPerKm)}` : ""}`;
  }
  return "";
}

/** Texto de ritmo/velocidad de una serie: sprint en m/s, resto en ritmo. */
export function intervalMetric(modality: string, distanceM: number | null | undefined, timeSec: number | null | undefined): string | null {
  const fast = modality === "SPRINT" || modality === "HURDLES" || (distanceM != null && distanceM <= 400);
  if (fast) {
    const v = speedMs(distanceM, timeSec);
    return v == null ? null : `${v.toFixed(2).replace(".", ",")} m/s`;
  }
  const p = paceSecPerKm(distanceM, timeSec);
  return p == null ? null : formatPace(p);
}
