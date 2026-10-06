import { z } from "zod";

import { AVOID, BODY_AREAS, EQUIPMENT } from "./options";

const keys = <T extends Record<string, string>>(o: T) => Object.keys(o) as [keyof T & string, ...(keyof T & string)[]];

const alternativeSchema = z.object({
  name: z.string().min(2).max(80),
  equipment: z.array(z.enum(keys(EQUIPMENT))).max(4),
});

export const aiExerciseSchema = z.object({
  name: z.string().min(2).max(80),
  sets: z.number().int().min(1).max(10),
  reps: z.string().min(1).max(30),
  /** RPE/RIR, %RM o descripción («suave», «ritmo de carrera»…). */
  intensity: z.string().max(40),
  rest: z.string().max(20),
  how: z.string().max(240),
  equipment: z.array(z.enum(keys(EQUIPMENT))).min(1).max(4),
  /** Qué patrones exigentes implica (para respetar lo que el usuario quiere evitar). */
  patterns: z.array(z.enum(keys(AVOID))).max(4),
  /** Zonas que carga de forma importante (para respetar sus molestias). */
  areas: z.array(z.enum(keys(BODY_AREAS))).max(4),
  alternatives: z.array(alternativeSchema).max(3),
});

const daySchema = z.object({
  weekday: z.number().int().min(1).max(7),
  title: z.string().min(2).max(80),
  type: z.enum(["STRENGTH", "TECHNICAL", "TRACK", "MIXED"]),
  durationMin: z.number().int().min(10).max(240),
  warmup: z.string().min(5).max(400),
  exercises: z.array(aiExerciseSchema).min(1).max(12),
  cooldown: z.string().max(300),
  /** Versión suave del mismo día: menos volumen e intensidad, sin impactos. */
  light: z.object({
    durationMin: z.number().int().min(10).max(240),
    exercises: z.array(aiExerciseSchema).min(1).max(10),
    note: z.string().max(200),
  }),
});

const phaseSchema = z.object({
  name: z.string().min(2).max(60),
  focus: z.string().max(300),
  weeks: z.number().int().min(1).max(8),
  /** Fase de descarga (menos volumen). */
  deload: z.boolean(),
  /** Progresión semanal dentro de la fase: +1 sube el volumen ≈10 %/semana, 0 lo mantiene, −1 lo baja. */
  progression: z.number().int().min(-1).max(1),
  days: z.array(daySchema).min(1).max(7),
});

export const aiPlanSchema = z.object({
  title: z.string().min(3).max(60),
  summary: z.string().max(700),
  why: z.string().max(700),
  phases: z.array(phaseSchema).min(1).max(8),
});

export type AiPlan = z.infer<typeof aiPlanSchema>;
export type AiExercise = z.infer<typeof aiExerciseSchema>;
export type AiDay = AiPlan["phases"][number]["days"][number];

/** Respuesta para sustituir ejercicios de un día (cambio de sitio o de material). */
export const aiSwapSchema = z.object({ exercises: z.array(aiExerciseSchema).min(1).max(12) });
