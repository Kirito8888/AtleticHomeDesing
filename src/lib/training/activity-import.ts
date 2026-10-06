// Importación de actividades de reloj/ciclocomputador: FIT (Garmin, Coros,
// Polar, Suunto, Wahoo…), GPX (Strava y casi cualquier app) y TCX (Garmin
// Connect, Polar Flow). Puro: recibe los bytes y devuelve un resumen; no toca la BD.
import { Decoder, Stream } from "@garmin/fitsdk";
import { XMLParser } from "fast-xml-parser";

import { localDay } from "@/lib/dates";

export type Modality = "RUN" | "SPRINT" | "HURDLES" | "SWIM" | "CYCLE" | "ROW" | "WALK" | "OTHER";

export interface Sample {
  time: Date;
  lat?: number;
  lon?: number;
  altitude?: number;
  distance?: number; // acumulada, m
  hr?: number;
  cadence?: number;
  speed?: number; // m/s
}

export interface ParsedActivity {
  format: "FIT" | "GPX" | "TCX";
  device: string | null;
  sport: string | null;
  modality: Modality;
  surface: "TRACK" | "ROAD" | "TRAIL" | "TREADMILL" | "POOL_25" | "POOL_50" | "OPEN_WATER" | null;
  startedAt: Date;
  /** Día de calendario en Madrid ("YYYY-MM-DD"). */
  date: string;
  elapsedSec: number;
  movingSec: number;
  distanceM: number | null;
  hrAvg: number | null;
  hrMax: number | null;
  elevationGainM: number | null;
  avgCadence: number | null;
  samples: Sample[];
}

export class ImportError extends Error {}

/** Pausa: entre dos muestras separadas más de esto sin avanzar, el tiempo no cuenta como "en movimiento". */
const PAUSE_GAP_SEC = 10;
const MIN_MOVING_SPEED = 0.3; // m/s

// ---------------------------------------------------------------------------
// Utilidades
// ---------------------------------------------------------------------------

/** Distancia en metros entre dos coordenadas (haversine). */
export function haversine(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6_371_000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

const num = (v: unknown): number | undefined => {
  const n = typeof v === "number" ? v : typeof v === "string" && v.trim() !== "" ? Number(v) : NaN;
  return Number.isFinite(n) ? n : undefined;
};
const round = (x: number, d = 0) => Math.round(x * 10 ** d) / 10 ** d;

function modalityOf(sport: string | null): Modality {
  const s = (sport ?? "").toLowerCase();
  if (/run|jog|track|correr|carrera/.test(s)) return "RUN";
  if (/swim|nata/.test(s)) return "SWIM";
  if (/cycl|bik|ride|bici/.test(s)) return "CYCLE";
  if (/walk|hik|camin|senderis/.test(s)) return "WALK";
  if (/row|remo/.test(s)) return "ROW";
  return "OTHER";
}

/**
 * Totales a partir de las muestras: distancia (la del dispositivo o, si no hay,
 * por GPS), tiempo en movimiento sin pausas, FC media ponderada por tiempo,
 * desnivel positivo (ignorando oscilaciones < 1 m) y cadencia media.
 */
export function summarize(samples: Sample[]) {
  const s = samples.filter((x) => x.time instanceof Date && !Number.isNaN(x.time.getTime())).sort((a, b) => a.time.getTime() - b.time.getTime());
  if (s.length < 2) throw new ImportError("La actividad no tiene suficientes puntos registrados");

  // Distancia acumulada: la del dispositivo si existe, si no por GPS
  const hasDeviceDistance = s.some((x) => x.distance != null && x.distance > 0);
  let gps = 0;
  const cum: number[] = [0];
  for (let i = 1; i < s.length; i++) {
    const a = s[i - 1];
    const b = s[i];
    if (a.lat != null && a.lon != null && b.lat != null && b.lon != null) gps += haversine(a.lat, a.lon, b.lat, b.lon);
    cum.push(hasDeviceDistance ? (b.distance ?? cum[i - 1]) : gps);
  }
  const distance = hasDeviceDistance ? Math.max(...s.map((x) => x.distance ?? 0)) : gps;

  let moving = 0;
  let hrWeighted = 0;
  let hrTime = 0;
  let cadWeighted = 0;
  let cadTime = 0;
  for (let i = 1; i < s.length; i++) {
    const dt = (s[i].time.getTime() - s[i - 1].time.getTime()) / 1000;
    if (dt <= 0) continue;
    const advanced = cum[i] - cum[i - 1] > MIN_MOVING_SPEED * dt || (s[i].speed ?? 0) > MIN_MOVING_SPEED;
    const isMoving = dt <= PAUSE_GAP_SEC && (advanced || distance === 0);
    if (isMoving) moving += dt;
    const hr = s[i].hr;
    if (hr != null && hr > 0 && dt <= PAUSE_GAP_SEC) {
      hrWeighted += hr * dt;
      hrTime += dt;
    }
    const cad = s[i].cadence;
    if (cad != null && cad > 0 && isMoving) {
      cadWeighted += cad * dt;
      cadTime += dt;
    }
  }

  let gain = 0;
  let ref: number | undefined;
  for (const x of s) {
    if (x.altitude == null) continue;
    if (ref == null) ref = x.altitude;
    else if (x.altitude - ref >= 1) {
      gain += x.altitude - ref;
      ref = x.altitude;
    } else if (x.altitude < ref) ref = x.altitude;
  }
  const hasAltitude = s.some((x) => x.altitude != null);
  const hrs = s.map((x) => x.hr).filter((h): h is number => h != null && h > 0);

  return {
    startedAt: s[0].time,
    elapsedSec: Math.round((s.at(-1)!.time.getTime() - s[0].time.getTime()) / 1000),
    movingSec: Math.round(moving),
    distanceM: distance > 0 ? round(distance, 1) : null,
    hrAvg: hrTime ? Math.round(hrWeighted / hrTime) : null,
    hrMax: hrs.length ? Math.max(...hrs) : null,
    elevationGainM: hasAltitude ? round(gain, 1) : null,
    avgCadence: cadTime ? Math.round(cadWeighted / cadTime) : null,
    samples: s,
  };
}

// ---------------------------------------------------------------------------
// FIT
// ---------------------------------------------------------------------------

const SEMICIRCLE = 180 / 2 ** 31;

function parseFit(buf: Buffer): ParsedActivity {
  const stream = Stream.fromBuffer(buf);
  const decoder = new Decoder(stream);
  if (!decoder.isFIT()) throw new ImportError("No es un fichero FIT");
  if (!decoder.checkIntegrity()) throw new ImportError("El fichero FIT está dañado o incompleto (CRC)");
  const { messages, errors } = decoder.read({ mergeHeartRates: true });
  if (errors.length) throw new ImportError(`No se pudo leer el FIT: ${String(errors[0])}`);

  type R = Record<string, unknown>;
  const records = (messages.recordMesgs ?? []) as R[];
  const session = ((messages.sessionMesgs ?? []) as R[])[0];
  const fileId = ((messages.fileIdMesgs ?? []) as R[])[0];

  const samples: Sample[] = records.map((r) => ({
    time: new Date(r.timestamp as string | Date),
    lat: num(r.positionLat) != null ? num(r.positionLat)! * SEMICIRCLE : undefined,
    lon: num(r.positionLong) != null ? num(r.positionLong)! * SEMICIRCLE : undefined,
    altitude: num(r.enhancedAltitude) ?? num(r.altitude),
    distance: num(r.distance),
    hr: num(r.heartRate),
    cadence: num(r.cadence),
    speed: num(r.enhancedSpeed) ?? num(r.speed),
  }));
  const sum = summarize(samples);

  // El resumen de sesión del dispositivo manda (mide pausas y desnivel mejor);
  // si falta, se usa lo calculado de las muestras.
  const sport = (session?.sport as string | undefined) ?? null;
  const subSport = (session?.subSport as string | undefined) ?? "";
  const pool = num(session?.poolLength);
  const surface: ParsedActivity["surface"] =
    subSport === "track" ? "TRACK" : subSport === "treadmill" ? "TREADMILL" : subSport === "trail" ? "TRAIL"
    : subSport === "lapSwimming" && pool ? (pool >= 45 ? "POOL_50" : "POOL_25") : subSport === "openWater" ? "OPEN_WATER" : null;
  const startedAt = session?.startTime ? new Date(session.startTime as string) : sum.startedAt;
  const manufacturer = typeof fileId?.manufacturer === "string" ? fileId.manufacturer : null;

  return {
    format: "FIT",
    // "polarElectro" → "Polar Electro"
    device: manufacturer ? manufacturer.replace(/([a-z])([A-Z])/g, "$1 $2").replace(/^./, (c) => c.toUpperCase()) : null,
    sport: subSport && subSport !== "generic" ? `${sport ?? ""}/${subSport}` : sport,
    modality: subSport === "track" && sport === "running" ? "RUN" : modalityOf(sport),
    surface,
    startedAt,
    date: localDay(startedAt),
    elapsedSec: Math.round(num(session?.totalElapsedTime) ?? sum.elapsedSec),
    movingSec: Math.round(num(session?.totalTimerTime) ?? sum.movingSec),
    distanceM: num(session?.totalDistance) != null ? round(num(session?.totalDistance)!, 1) : sum.distanceM,
    hrAvg: num(session?.avgHeartRate) ?? sum.hrAvg,
    hrMax: num(session?.maxHeartRate) ?? sum.hrMax,
    elevationGainM: num(session?.totalAscent) ?? sum.elevationGainM,
    avgCadence: num(session?.avgRunningCadence) ?? num(session?.avgCadence) ?? sum.avgCadence,
    samples: sum.samples,
  };
}

// ---------------------------------------------------------------------------
// GPX / TCX (XML)
// ---------------------------------------------------------------------------

const xml = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@",
  removeNSPrefix: true, // gpxtpx:hr, ns3:TPX… → hr, TPX
  parseTagValue: false,
  isArray: (name) => ["trk", "trkseg", "trkpt", "Activity", "Lap", "Track", "Trackpoint"].includes(name),
  processEntities: false, // sin expansión de entidades (evita "billion laughs")
});

const arr = <T>(v: T | T[] | undefined): T[] => (v == null ? [] : Array.isArray(v) ? v : [v]);

function finish(format: "GPX" | "TCX", sport: string | null, device: string | null, samples: Sample[], laps?: { time: number; distance: number }): ParsedActivity {
  const sum = summarize(samples);
  const modality = modalityOf(sport);
  return {
    format,
    device,
    sport,
    modality,
    surface: null,
    startedAt: sum.startedAt,
    date: localDay(sum.startedAt),
    elapsedSec: sum.elapsedSec,
    movingSec: laps?.time ? Math.round(laps.time) : sum.movingSec,
    distanceM: laps?.distance ? round(laps.distance, 1) : sum.distanceM,
    hrAvg: sum.hrAvg,
    hrMax: sum.hrMax,
    elevationGainM: sum.elevationGainM,
    avgCadence: sum.avgCadence,
    samples: sum.samples,
  };
}

function parseGpx(text: string): ParsedActivity {
  type Pt = { "@lat"?: string; "@lon"?: string; ele?: string; time?: string; extensions?: Record<string, Record<string, string> | string> };
  const doc = xml.parse(text) as { gpx?: { metadata?: unknown; trk?: Array<{ type?: string; name?: string; trkseg?: Array<{ trkpt?: Pt[] }> }>; "@creator"?: string } };
  const gpx = doc.gpx;
  if (!gpx) throw new ImportError("No es un fichero GPX");
  const trk = arr(gpx.trk);
  const points = trk.flatMap((t) => arr(t.trkseg).flatMap((sg) => arr(sg.trkpt)));
  const ext = (p: Pt, key: string) => {
    for (const v of Object.values(p.extensions ?? {})) {
      if (typeof v === "object" && v && key in v) return num(v[key]);
    }
    return num((p.extensions as Record<string, string> | undefined)?.[key]);
  };
  const samples: Sample[] = points.map((p) => ({
    time: new Date(p.time ?? NaN),
    lat: num(p["@lat"]),
    lon: num(p["@lon"]),
    altitude: num(p.ele),
    hr: ext(p, "hr"),
    cadence: ext(p, "cad"),
  }));
  return finish("GPX", trk[0]?.type ?? null, gpx["@creator"] ?? null, samples);
}

function parseTcx(text: string): ParsedActivity {
  type Tp = {
    Time?: string;
    Position?: { LatitudeDegrees?: string; LongitudeDegrees?: string };
    AltitudeMeters?: string;
    DistanceMeters?: string;
    HeartRateBpm?: { Value?: string };
    Cadence?: string;
    Extensions?: Record<string, Record<string, string>>;
  };
  type Lap = { TotalTimeSeconds?: string; DistanceMeters?: string; Track?: Array<{ Trackpoint?: Tp[] }> };
  const doc = xml.parse(text) as { TrainingCenterDatabase?: { Activities?: { Activity?: Array<{ "@Sport"?: string; Lap?: Lap[]; Creator?: { Name?: string } }> } } };
  const act = arr(doc.TrainingCenterDatabase?.Activities?.Activity)[0];
  if (!act) throw new ImportError("No es un fichero TCX con actividades");
  const laps = arr(act.Lap);
  const tps = laps.flatMap((l) => arr(l.Track).flatMap((t) => arr(t.Trackpoint)));
  const samples: Sample[] = tps.map((t) => ({
    time: new Date(t.Time ?? NaN),
    lat: num(t.Position?.LatitudeDegrees),
    lon: num(t.Position?.LongitudeDegrees),
    altitude: num(t.AltitudeMeters),
    distance: num(t.DistanceMeters),
    hr: num(t.HeartRateBpm?.Value),
    // Garmin escribe la cadencia de carrera en la extensión TPX/RunCadence
    cadence: num(t.Cadence) ?? num(Object.values(t.Extensions ?? {})[0]?.RunCadence),
  }));
  const lapTotals = laps.reduce((a, l) => ({ time: a.time + (num(l.TotalTimeSeconds) ?? 0), distance: a.distance + (num(l.DistanceMeters) ?? 0) }), { time: 0, distance: 0 });
  return finish("TCX", act["@Sport"] ?? null, act.Creator?.Name ?? null, samples, lapTotals);
}

// ---------------------------------------------------------------------------

export const MAX_ACTIVITY_BYTES = 25 * 1024 * 1024;

/** Detecta el formato por el contenido (no por la extensión) y lo interpreta. */
export function parseActivity(buf: Buffer): ParsedActivity {
  if (buf.length > MAX_ACTIVITY_BYTES) throw new ImportError("El fichero supera 25 MB");
  if (buf.length >= 12 && buf.subarray(8, 12).toString("latin1") === ".FIT") return parseFit(buf);
  const head = buf.subarray(0, 2048).toString("utf8");
  if (/<!DOCTYPE|<!ENTITY/i.test(head)) throw new ImportError("XML con DTD/entidades no permitido");
  const text = buf.toString("utf8");
  if (/<gpx[\s>]/.test(head)) return parseGpx(text);
  if (/<TrainingCenterDatabase[\s>]/.test(head)) return parseTcx(text);
  throw new ImportError("Formato no reconocido: sube un fichero .fit, .gpx o .tcx");
}

/** Segundos en cada zona de FC (Z1–Z5 por % de la FC máxima: <60, 60–70, 70–80, 80–90, ≥90). */
export function hrZoneSeconds(samples: Sample[], hrMax: number): number[] {
  const zones = [0, 0, 0, 0, 0];
  for (let i = 1; i < samples.length; i++) {
    const hr = samples[i].hr;
    const dt = (samples[i].time.getTime() - samples[i - 1].time.getTime()) / 1000;
    if (hr == null || hr <= 0 || dt <= 0 || dt > PAUSE_GAP_SEC) continue;
    const pct = hr / hrMax;
    const z = pct < 0.6 ? 0 : pct < 0.7 ? 1 : pct < 0.8 ? 2 : pct < 0.9 ? 3 : 4;
    zones[z] += dt;
  }
  return zones.map((s) => Math.round(s));
}
