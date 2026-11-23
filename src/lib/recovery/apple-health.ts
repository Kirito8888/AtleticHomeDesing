// Apple Salud y Fitness (export.xml) → totales por día y entrenos. Puro y por trozos:
// el fichero se lee en el navegador y solo salen los totales diarios y el resumen de cada entreno.
// La VFC de Apple es SDNN, no rMSSD: viaja como `hrvSdnnMs` y nunca se mezcla con la de Atlenza.

export type DayAgg = {
  date: string;
  sleepMin: number;
  restingHr: number | null;
  hrvSdnnMs: number | null;
  weightKg: number | null;
};

/** Lo que entiende `workoutSchema` (lib/apple-fitness/payload.ts): fechas «AAAA-MM-DD HH:mm:ss ±hhmm» tal como las da Apple. */
export type AppleWorkout = {
  type: string;
  start: string;
  end: string;
  durationMin: number;
  distanceM?: number;
  kcal?: number;
  hrAvg?: number;
  hrMax?: number;
};

type DayAcc = { sleep: Array<[number, number]>; rhr: number[]; hrv: number[]; weight: { ms: number; kg: number } | null };

export type AppleState = {
  buf: string;
  days: Map<string, DayAcc>;
  workouts: AppleWorkout[];
  /** Entrenos que no se pueden enviar (sin fechas válidas o de menos de 1 minuto). */
  skipped: number;
  records: number;
};

export const newAppleState = (): AppleState => ({ buf: "", days: new Map(), workouts: [], skipped: 0, records: 0 });

const SCAN = /<Record\b[^>]*?\/?>|<Workout\b[^>]*?(?:\/>|>[\s\S]*?<\/Workout>)/g;
/** Un fichero normal no deja nada pendiente; más de esto sin cerrar es un fichero dañado. */
const MAX_PENDING = 8 * 1024 * 1024;

const attrRe = new Map<string, RegExp>();
function attr(tag: string, name: string): string | null {
  let re = attrRe.get(name);
  if (!re) attrRe.set(name, (re = new RegExp(`\\b${name}="([^"]*)"`)));
  return re.exec(tag)?.[1] ?? null;
}

/** «2026-10-08 07:12:00 +0200» → milisegundos (respetando el desfase). */
function toMs(s: string | null): number {
  const m = s ? /^(\d{4}-\d{2}-\d{2}) (\d{2}:\d{2}:\d{2}) ([+-]\d{2})(\d{2})$/.exec(s.trim()) : null;
  return m ? Date.parse(`${m[1]}T${m[2]}${m[3]}:${m[4]}`) : NaN;
}

const num = (s: string | null): number | null => {
  if (s == null || s === "") return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
};

const round = (n: number, d = 0) => Math.round(n * 10 ** d) / 10 ** d;

/** Procesa un trozo de texto; los registros y entrenos cortados entre trozos se completan con el siguiente. */
export function feedApple(st: AppleState, chunk: string, from: string | null = null): void {
  st.buf += chunk;
  let end = 0;
  SCAN.lastIndex = 0;
  for (let m = SCAN.exec(st.buf); m; m = SCAN.exec(st.buf)) {
    end = SCAN.lastIndex;
    if (m[0].startsWith("<Workout")) readWorkout(st, m[0], from);
    else readRecord(st, m[0], from);
  }
  // Conserva solo lo que pueda ser el principio de un registro o entreno sin cerrar
  const rest = st.buf.slice(end);
  const open = rest.search(/<(Record|Workout)\b/);
  st.buf = open >= 0 ? (rest.length - open > MAX_PENDING ? "" : rest.slice(open)) : rest.slice(-20);
}

function readRecord(st: AppleState, tag: string, from: string | null) {
  const type = attr(tag, "type");
  if (
    type !== "HKCategoryTypeIdentifierSleepAnalysis" &&
    type !== "HKQuantityTypeIdentifierRestingHeartRate" &&
    type !== "HKQuantityTypeIdentifierHeartRateVariabilitySDNN" &&
    type !== "HKQuantityTypeIdentifierBodyMass"
  )
    return;
  const endDate = attr(tag, "endDate");
  if (!endDate) return;
  const day = endDate.slice(0, 10); // el sueño cuenta para el día en que te despiertas
  if (from && day < from) return;
  const d = st.days.get(day) ?? { sleep: [], rhr: [], hrv: [], weight: null };
  let used = true;
  if (type === "HKCategoryTypeIdentifierSleepAnalysis") {
    // Solo fases de sueño («Asleep…»), no «InBed» ni «Awake»
    used = false;
    if (/Asleep/.test(attr(tag, "value") ?? "")) {
      const s = toMs(attr(tag, "startDate"));
      const e = toMs(endDate);
      if (e > s && (e - s) / 60000 < 24 * 60) {
        d.sleep.push([s, e]);
        used = true;
      }
    }
  } else {
    const v = num(attr(tag, "value"));
    if (v == null) used = false;
    else if (type === "HKQuantityTypeIdentifierRestingHeartRate") {
      if (v >= 25 && v <= 150) d.rhr.push(v);
      else used = false;
    } else if (type === "HKQuantityTypeIdentifierHeartRateVariabilitySDNN") {
      if (v >= 1 && v <= 300) d.hrv.push(v);
      else used = false;
    } else {
      const kg = (attr(tag, "unit") ?? "kg").toLowerCase() === "lb" ? v * 0.45359237 : v;
      const ms = toMs(endDate);
      if (kg >= 25 && kg <= 300) {
        if (!d.weight || ms >= d.weight.ms) d.weight = { ms: Number.isNaN(ms) ? 0 : ms, kg };
      } else used = false;
    }
  }
  if (!used) return;
  st.records++;
  st.days.set(day, d);
}

/** Tipos habituales en español (los que `mapActivity` ya clasifica); el resto se deja en inglés legible. */
const ACTIVITY_ES: Record<string, string> = {
  Running: "Correr",
  Walking: "Caminar",
  Hiking: "Senderismo",
  Cycling: "Ciclismo",
  Swimming: "Natación",
  Rowing: "Remo",
  Elliptical: "Elíptica",
  TraditionalStrengthTraining: "Fuerza",
  FunctionalStrengthTraining: "Fuerza funcional",
  CoreTraining: "Core",
  HighIntensityIntervalTraining: "HIIT",
  CrossTraining: "Entrenamiento cruzado",
  MixedCardio: "Cardio mixto",
  StairClimbing: "Escaladora",
  Other: "Otro",
};

export function activityName(raw: string | null): string {
  const key = (raw ?? "").replace(/^HKWorkoutActivityType/, "");
  if (!key) return "Otro";
  return ACTIVITY_ES[key] ?? key.replace(/([a-z0-9])([A-Z])/g, "$1 $2");
}

const toKm = (v: number, unit: string) => (/^mi/i.test(unit) ? v * 1.609344 : /^km/i.test(unit) ? v : /^m$/i.test(unit) ? v / 1000 : null);
const toKcal = (v: number, unit: string) => (/^kj/i.test(unit) ? v / 4.184 : /^(kcal|cal)$/i.test(unit) ? v : null);

function readWorkout(st: AppleState, xml: string, from: string | null) {
  const open = /^<Workout\b[^>]*>/.exec(xml)?.[0] ?? xml;
  const startDate = attr(open, "startDate");
  const endDate = attr(open, "endDate");
  const s = toMs(startDate);
  const e = toMs(endDate);
  if (from && (startDate ?? "").slice(0, 10) < from) return;
  if (Number.isNaN(s) || Number.isNaN(e) || e <= s) {
    st.skipped++;
    return;
  }
  // Duración: el atributo, y si falta o no cuadra, fin − inicio
  let durationMin = (e - s) / 60000;
  const dur = num(attr(open, "duration"));
  if (dur != null && dur > 0) {
    const u = (attr(open, "durationUnit") ?? "min").toLowerCase();
    const mins = u.startsWith("h") ? dur * 60 : u === "s" || u === "sec" ? dur / 60 : dur;
    if (mins >= 0.5 && mins <= 1440) durationMin = mins;
  }
  if (durationMin < 1 || durationMin > 1440) {
    st.skipped++;
    return;
  }
  const w: AppleWorkout = { type: activityName(attr(open, "workoutActivityType")), start: startDate!, end: endDate!, durationMin: round(durationMin, 2) };

  // Estadísticas (iOS 16+) o, en exportaciones antiguas, totales en el propio <Workout>
  let km: number | null = null;
  let kcal: number | null = null;
  let hrAvg: number | null = null;
  let hrMax: number | null = null;
  for (const t of xml.match(/<WorkoutStatistics\b[^>]*?\/?>/g) ?? []) {
    const type = attr(t, "type") ?? "";
    const unit = attr(t, "unit") ?? "";
    if (/^HKQuantityTypeIdentifierDistance/.test(type) && km == null) {
      const v = num(attr(t, "sum"));
      if (v != null && v > 0) km = toKm(v, unit);
    } else if (type === "HKQuantityTypeIdentifierActiveEnergyBurned") {
      const v = num(attr(t, "sum"));
      if (v != null && v > 0) kcal = toKcal(v, unit);
    } else if (type === "HKQuantityTypeIdentifierHeartRate") {
      hrAvg = num(attr(t, "average"));
      hrMax = num(attr(t, "maximum"));
    }
  }
  if (km == null) {
    const v = num(attr(open, "totalDistance"));
    if (v != null && v > 0) km = toKm(v, attr(open, "totalDistanceUnit") ?? "km");
  }
  if (kcal == null) {
    const v = num(attr(open, "totalEnergyBurned"));
    if (v != null && v > 0) kcal = toKcal(v, attr(open, "totalEnergyBurnedUnit") ?? "kcal");
  }
  if (km != null && km > 0 && km <= 1000) w.distanceM = Math.round(km * 1000);
  if (kcal != null && kcal > 0 && kcal <= 20_000) w.kcal = Math.round(kcal);
  if (hrAvg != null && hrAvg >= 30 && hrAvg <= 250) w.hrAvg = Math.round(hrAvg);
  if (hrMax != null && hrMax >= 30 && hrMax <= 250) w.hrMax = Math.round(hrMax);
  if (w.hrAvg != null && w.hrMax != null && w.hrMax < w.hrAvg) w.hrMax = w.hrAvg;
  st.workouts.push(w);
}

/** Minutos dormidos de un día: se unen los intervalos solapados (reloj + iPhone) para no contar dos veces. */
function sleepMinutes(intervals: Array<[number, number]>): number {
  const sorted = [...intervals].sort((a, b) => a[0] - b[0]);
  let total = 0;
  let curS = 0;
  let curE = 0;
  for (const [s, e] of sorted) {
    if (!curE) [curS, curE] = [s, e];
    else if (s <= curE) curE = Math.max(curE, e);
    else {
      total += curE - curS;
      [curS, curE] = [s, e];
    }
  }
  if (curE) total += curE - curS;
  return total / 60000;
}

const avg = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;

/** Días con datos (sueño hasta 16 h; FC en reposo y VFC = media del día; peso = última muestra). */
export function appleDays(st: AppleState): DayAgg[] {
  return [...st.days]
    .map(([date, d]) => ({
      date,
      sleepMin: Math.round(Math.min(sleepMinutes(d.sleep), 16 * 60)),
      restingHr: d.rhr.length ? Math.round(avg(d.rhr)) : null,
      hrvSdnnMs: d.hrv.length ? round(avg(d.hrv), 1) : null,
      weightKg: d.weight ? round(d.weight.kg, 2) : null,
    }))
    .filter((d) => d.sleepMin > 0 || d.restingHr != null || d.hrvSdnnMs != null || d.weightKg != null)
    .sort((a, b) => a.date.localeCompare(b.date));
}

/** Entrenos ordenados por inicio (el más antiguo primero), sin repetidos exactos. */
export function appleWorkouts(st: AppleState): AppleWorkout[] {
  const seen = new Set<string>();
  return st.workouts
    .filter((w) => {
      const k = `${w.start}|${w.type}`;
      return seen.has(k) ? false : (seen.add(k), true);
    })
    .sort((a, b) => toMs(a.start) - toMs(b.start));
}
