/**
 * v3.1 · Comparativa lado a lado «web vs reloj» y reglas de fusión. Puro (sin BD).
 * Fusionar = COMPLETAR huecos: lo que la usuaria escribió no se pisa.
 */
export interface WatchValues {
  durationSec: number;
  distanceM: number | null;
  hrAvg: number | null;
  hrMax: number | null;
  kcal: number | null;
}

/** Lo que Atlenza ya tiene de la sesión del día. */
export interface WebValues {
  type: "TRACK" | "TECHNICAL" | "STRENGTH" | "MIXED";
  durationSec: number | null;
  distanceM: number | null;
  hrAvg: number | null;
  hrMax: number | null;
  kcal: number | null;
  /** ¿Tiene parte de pista/cardio donde guardar distancia y FC? */
  hasTrack: boolean;
}

export type CompareField = "duration" | "distance" | "hrAvg" | "hrMax" | "kcal";

export interface CompareRow {
  field: CompareField;
  label: string;
  unit: string;
  web: number | null;
  watch: number | null;
  /** El reloj trae el dato y la web no lo tiene → «Completar» lo rellena. */
  willFill: boolean;
  /** Los dos tienen valor y difieren más del margen: se muestra, no se toca. */
  differs: boolean;
}

const TOL: Record<CompareField, number> = { duration: 0.1, distance: 0.05, hrAvg: 0.05, hrMax: 0.05, kcal: 0.15 };

/** ¿Puede guardarse FC/distancia en esa sesión? (TRACK/MIXED con o sin detalle de pista; el resto no lo modela). */
export const canHoldTrack = (type: WebValues["type"]) => type === "TRACK" || type === "MIXED";

export function compareWorkout(watch: WatchValues, web: WebValues): CompareRow[] {
  const trackOk = web.hasTrack || canHoldTrack(web.type);
  const spec: { field: CompareField; label: string; unit: string; web: number | null; watch: number | null; storable: boolean }[] = [
    { field: "duration", label: "Duración", unit: "min", web: web.durationSec == null ? null : web.durationSec / 60, watch: watch.durationSec / 60, storable: true },
    { field: "distance", label: "Distancia", unit: "km", web: web.distanceM == null ? null : web.distanceM / 1000, watch: watch.distanceM == null ? null : watch.distanceM / 1000, storable: trackOk },
    { field: "hrAvg", label: "FC media", unit: "lpm", web: web.hrAvg, watch: watch.hrAvg, storable: trackOk },
    { field: "hrMax", label: "FC máx.", unit: "lpm", web: web.hrMax, watch: watch.hrMax, storable: trackOk },
    { field: "kcal", label: "kcal", unit: "kcal", web: web.kcal, watch: watch.kcal, storable: true },
  ];
  return spec.map((r) => ({
    field: r.field,
    label: r.label,
    unit: r.unit,
    web: r.web,
    watch: r.watch,
    willFill: r.storable && r.watch != null && (r.web == null || (r.field === "duration" && r.web === 0)),
    differs: r.web != null && r.watch != null && r.web > 0 && Math.abs(r.watch - r.web) / r.web > TOL[r.field],
  }));
}

/** Campos a escribir en la sesión (solo huecos). Vacío = nada que completar. */
export interface MergePatch {
  durationSec?: number;
  kcal?: number;
  distanceM?: number;
  hrAvg?: number;
  hrMax?: number;
}

export function mergePatch(watch: WatchValues, web: WebValues): MergePatch {
  const fill = new Set(compareWorkout(watch, web).filter((r) => r.willFill).map((r) => r.field));
  const p: MergePatch = {};
  if (fill.has("duration")) p.durationSec = watch.durationSec;
  if (fill.has("kcal") && watch.kcal != null) p.kcal = watch.kcal;
  if (fill.has("distance") && watch.distanceM != null) p.distanceM = watch.distanceM;
  if (fill.has("hrAvg") && watch.hrAvg != null) p.hrAvg = watch.hrAvg;
  if (fill.has("hrMax") && watch.hrMax != null) p.hrMax = watch.hrMax;
  return p;
}
