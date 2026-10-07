import { z } from "zod";

import { isoDate } from "@/lib/dates";
import { BODY_AREA_LABEL, type BodyAreaName } from "@/lib/recovery/injury-rules";

const optInt = (min: number, max: number) => z.number().int().min(min).max(max).nullish();
const optNum = (min: number, max: number) => z.number().min(min).max(max).nullish();

export const disciplineEnum = z.enum([
  "SPRINT",
  "MIDDLE_DISTANCE",
  "LONG_DISTANCE",
  "HURDLES",
  "JUMPS",
  "THROWS",
  "COMBINED_EVENTS",
  "SWIMMING",
  "CYCLING",
  "STRENGTH",
  "OTHER",
]);

export const trackIntervalSchema = z.object({
  repetition: z.number().int().min(1).default(1),
  distanceM: optNum(0, 100_000),
  timeSec: optNum(0, 86_400),
  recoverySec: optInt(0, 3600),
  hrAvg: optInt(30, 250),
  hrMax: optInt(30, 250),
  rpe: optNum(0, 10),
  isStartBlocks: z.boolean().default(false),
  isFlying: z.boolean().default(false),
  splitsSec: z.array(z.number().min(0)).max(100).default([]),
  notes: z.string().max(1000).nullish(),
});

export const trackDetailSchema = z.object({
  modality: z.enum(["RUN", "SPRINT", "HURDLES", "SWIM", "CYCLE", "ROW", "WALK", "OTHER"]),
  surface: z.enum(["TRACK", "ROAD", "TRAIL", "TREADMILL", "POOL_25", "POOL_50", "OPEN_WATER", "OTHER"]).nullish(),
  distanceM: optNum(0, 1_000_000),
  movingTimeSec: optInt(0, 86_400),
  hrAvg: optInt(30, 250),
  hrMax: optInt(30, 250),
  elevationGainM: optNum(0, 20_000),
  avgCadence: optInt(0, 300),
  temperatureC: optNum(-40, 60),
  hrZoneSeconds: z.array(z.number().int().min(0)).max(7).default([]),
  intervals: z.array(trackIntervalSchema).max(200).default([]),
});

export const technicalAttemptSchema = z.object({
  markM: optNum(0, 120),
  isFoul: z.boolean().default(false),
  isMeasured: z.boolean().default(true),
  windMs: optNum(-20, 20),
  barHeightM: optNum(0, 7),
  cleared: z.boolean().nullish(),
  approachSteps: optInt(0, 40),
  rating: optInt(1, 5),
  runUpNotes: z.string().max(1000).nullish(),
  blockNotes: z.string().max(1000).nullish(),
  releaseNotes: z.string().max(1000).nullish(),
  videoUrl: z.string().url().max(500).nullish(),
});

export const technicalDetailSchema = z.object({
  event: z.enum([
    "JAVELIN",
    "SHOT_PUT",
    "DISCUS",
    "HAMMER",
    "WEIGHT_THROW",
    "LONG_JUMP",
    "TRIPLE_JUMP",
    "HIGH_JUMP",
    "POLE_VAULT",
    "OTHER",
  ]),
  implementWeightG: optInt(0, 20_000),
  implementModel: z.string().max(100).nullish(),
  poleLengthCm: optInt(0, 600),
  poleFlex: optNum(0, 50),
  approachType: z.enum(["STANDING", "SHORT", "MEDIUM", "FULL", "GLIDE", "ROTATIONAL"]).nullish(),
  approachSteps: optInt(0, 40),
  windMs: optNum(-20, 20),
  isCompetition: z.boolean().default(false),
  focus: z.string().max(500).nullish(),
  // Vídeo contado: de N revisados, cuántos con el codo estirado y con la cabeza estable
  videoTotal: optInt(0, 200),
  videoElbowOk: optInt(0, 200),
  videoHeadOk: optInt(0, 200),
  attempts: z.array(technicalAttemptSchema).max(150).default([]),
});

export const strengthSetSchema = z.object({
  exerciseId: z.string().min(1),
  reps: z.number().int().min(0).max(200),
  weightKg: z.number().min(0).max(1000).default(0),
  rpe: optNum(1, 10),
  rir: optInt(0, 20),
  isWarmup: z.boolean().default(false),
  isFailure: z.boolean().default(false),
  tempo: z.string().max(20).nullish(),
  restSec: optInt(0, 3600),
  velocityMs: optNum(0, 10),
  notes: z.string().max(500).nullish(),
});

export const strengthDetailSchema = z.object({
  bodyWeightKg: optNum(20, 300),
  sets: z.array(strengthSetSchema).max(300).default([]),
});

/** Sensaciones al cerrar la sesión: molestias por zona (alimentan los avisos). */
export const feelingSchema = z.object({
  area: z.enum(Object.keys(BODY_AREA_LABEL) as [BodyAreaName, ...BodyAreaName[]]),
  side: z.enum(["LEFT", "RIGHT", "BOTH"]).nullish(),
  pain: z.number().int().min(1).max(10),
});
export type Feeling = z.infer<typeof feelingSchema>;

const common = {
  date: isoDate,
  startedAt: z.iso.datetime({ offset: true }).nullish(),
  title: z.string().max(200).nullish(),
  discipline: disciplineEnum.nullish(),
  status: z.enum(["PLANNED", "COMPLETED", "SKIPPED"]).default("COMPLETED"),
  durationSec: optInt(0, 86_400),
  sessionRpe: optNum(0, 10),
  manualTss: optNum(0, 2000),
  cycleId: z.string().nullish(),
  notes: z.string().max(5000).nullish(),
  feelings: z.array(feelingSchema).max(8).nullish(),
};

export const createSessionSchema = z.discriminatedUnion("type", [
  z.object({ ...common, type: z.literal("TRACK"), track: trackDetailSchema }),
  z.object({ ...common, type: z.literal("TECHNICAL"), technical: technicalDetailSchema }),
  z.object({ ...common, type: z.literal("STRENGTH"), strength: strengthDetailSchema }),
  z.object({
    ...common,
    type: z.literal("MIXED"),
    track: trackDetailSchema.nullish(),
    technical: technicalDetailSchema.nullish(),
    strength: strengthDetailSchema.nullish(),
  }),
]);

export type CreateSessionInput = z.infer<typeof createSessionSchema>;

export const recoverySchema = z.object({
  date: isoDate,
  sleepHours: optNum(0, 24),
  sleepQuality: optInt(1, 5),
  hrvRmssdMs: optNum(1, 300),
  restingHr: optInt(25, 150),
  doms: optInt(0, 10),
  domsAreas: z
    .array(
      z.enum([
        "CHEST",
        "BACK",
        "SHOULDERS",
        "BICEPS",
        "TRICEPS",
        "FOREARMS",
        "CORE",
        "QUADS",
        "HAMSTRINGS",
        "GLUTES",
        "CALVES",
        "FULL_BODY",
      ]),
    )
    .default([]),
  fatigue: optInt(1, 5),
  stress: optInt(1, 5),
  mood: optInt(1, 5),
  bodyWeightKg: optNum(20, 300),
  bodyFatPct: optNum(1, 70),
  // Control rápido: dolor 0-10 en el test squeeze y en el talón, salto (cm), síntomas de codo
  squeezePain: optInt(0, 10),
  heelPain: optInt(0, 10),
  jumpCm: optNum(0, 200),
  elbowSymptoms: z.boolean().nullish(),
  notes: z.string().max(2000).nullish(),
});

export type RecoveryInput = z.infer<typeof recoverySchema>;

export const thresholdSchema = z.object({
  effectiveFrom: isoDate,
  hrMax: optInt(100, 250),
  hrRest: optInt(25, 120),
  lthr: optInt(80, 230),
  thresholdPaceSecPerKm: optNum(120, 900),
  thresholdPaceSecPer100mSwim: optNum(40, 300),
  ftpWatts: optInt(50, 700),
  notes: z.string().max(500).nullish(),
});
