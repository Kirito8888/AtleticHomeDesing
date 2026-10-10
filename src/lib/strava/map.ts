// v1.10 · Actividad de la API de Strava (resumen + streams) → ParsedActivity, como un FIT o un GPX.
// Puro (se prueba sin red).
import { localDay } from "@/lib/dates";
import type { Modality, ParsedActivity, Sample } from "@/lib/training/activity-import";

export type StravaActivity = {
  id: number | string;
  name?: string;
  sport_type?: string;
  type?: string;
  start_date: string;
  elapsed_time: number;
  moving_time?: number;
  distance?: number;
  total_elevation_gain?: number;
  average_heartrate?: number;
  max_heartrate?: number;
  average_cadence?: number;
  trainer?: boolean;
  device_name?: string;
};
export type StravaStreams = Partial<Record<"time" | "distance" | "heartrate" | "latlng" | "altitude" | "cadence" | "velocity_smooth", { data: unknown[] }>>;

const SPORT: Record<string, Modality> = {
  Run: "RUN",
  TrailRun: "RUN",
  VirtualRun: "RUN",
  Swim: "SWIM",
  Ride: "CYCLE",
  VirtualRide: "CYCLE",
  GravelRide: "CYCLE",
  MountainBikeRide: "CYCLE",
  EBikeRide: "CYCLE",
  Rowing: "ROW",
  VirtualRow: "ROW",
  Walk: "WALK",
  Hike: "WALK",
};

export function stravaToParsed(a: StravaActivity, streams: StravaStreams = {}): ParsedActivity {
  const sport = a.sport_type ?? a.type ?? null;
  const modality = (sport && SPORT[sport]) || "OTHER";
  const startedAt = new Date(a.start_date);
  const t = (streams.time?.data ?? []) as number[];
  const at = (k: keyof StravaStreams, i: number) => (streams[k]?.data?.[i] as number | undefined) ?? undefined;
  const samples: Sample[] = t.map((sec, i) => {
    const ll = streams.latlng?.data?.[i] as [number, number] | undefined;
    return {
      time: new Date(startedAt.getTime() + sec * 1000),
      distance: at("distance", i),
      hr: at("heartrate", i),
      altitude: at("altitude", i),
      cadence: at("cadence", i),
      speed: at("velocity_smooth", i),
      ...(ll ? { lat: ll[0], lon: ll[1] } : {}),
    };
  });
  const r = (n: number | undefined, d = 0) => (n == null ? null : Math.round(n * 10 ** d) / 10 ** d);
  return {
    format: "Strava",
    device: a.device_name ?? null,
    sport,
    modality,
    surface: a.trainer && modality === "RUN" ? "TREADMILL" : sport === "TrailRun" ? "TRAIL" : null,
    startedAt,
    date: localDay(startedAt),
    elapsedSec: Math.round(a.elapsed_time),
    movingSec: Math.round(a.moving_time ?? a.elapsed_time),
    distanceM: a.distance ? r(a.distance, 1) : null,
    hrAvg: r(a.average_heartrate),
    hrMax: r(a.max_heartrate),
    elevationGainM: a.total_elevation_gain != null ? r(a.total_elevation_gain) : null,
    // Strava da la cadencia de carrera por pierna: se dobla para tener pasos por minuto, como el FIT
    avgCadence: a.average_cadence != null ? Math.round(modality === "RUN" ? a.average_cadence * 2 : a.average_cadence) : null,
    samples,
  };
}
