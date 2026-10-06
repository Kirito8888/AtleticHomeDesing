import { z } from "zod";

/**
 * «Mis reglas»: umbrales y preferencias del usuario (AthleteProfile.prefs).
 * Los valores por defecto son genéricos; ninguno es un dato personal.
 */
export const prefsSchema = z.object({
  /** Redondeo de los kg calculados desde %RM. */
  kgStep: z.union([z.literal(0.5), z.literal(1), z.literal(1.25), z.literal(2.5)]).default(2.5),
  /** Cambio mínimo para actualizar la RM con una serie de test (5 %). */
  rmTestThreshold: z.number().min(0).max(0.5).default(0.05),
  /** Dolor (0-10) a partir del cual saltan los avisos. */
  squeezeMax: z.number().int().min(0).max(10).default(3),
  heelMax: z.number().int().min(0).max(10).default(3),
  /** Peso: aviso si sube ≥ X kg dos semanas seguidas, si cambia ≥ Y kg en el bloque o si baja de un mínimo (opcional). */
  weightGainWeekKg: z.number().min(0).max(5).default(0.5),
  weightBlockKg: z.number().min(0).max(10).default(1),
  weightMinKg: z.number().min(30).max(250).nullable().default(null),
  bodyFatBlockPts: z.number().min(0).max(20).default(3),
  /** Lanzamientos: tope semanal = ratio × media de las 4 semanas previas; horas mínimas entre sesiones. */
  throwCapRatio: z.number().min(1).max(3).default(1.3),
  throwMinHours: z.number().int().min(0).max(168).default(48),
  /** VFC: caída (%) de la media de la semana marcada frente a la referencia. */
  hrvDropPct: z.number().min(0).max(30).default(3),
  /** Vídeo contado: % mínimo de lanzamientos correctos antes de avisar (dos semanas seguidas). */
  videoMinPct: z.number().min(0).max(100).default(50),
  /** Recordatorios push. */
  remindTomorrowHour: z.number().int().min(0).max(23).nullable().default(20),
  remindMondayCheck: z.boolean().default(true),
  remindWeigh: z.boolean().default(false),
  /** Hidratos (g) según el día del plan; null = no ajustar. */
  carbsThrowDayG: z.number().int().min(0).max(1500).nullable().default(null),
  carbsHeavyDayG: z.number().int().min(0).max(1500).nullable().default(null),
  carbsRestDayG: z.number().int().min(0).max(1500).nullable().default(null),
  /** Checklist de la bolsa de competición. */
  checklist: z.array(z.string().min(1).max(60)).max(40).default(["Licencia / DNI", "Dorsal e imperdibles", "Clavos y llave", "Jabalinas / implementos", "Ropa de calentamiento", "Agua y comida", "Cinta métrica"]),
  /** Objetivos de la temporada (líneas en la gráfica de marcas). */
  seasonGoals: z.array(z.object({ label: z.string().min(1).max(40), markM: z.number().min(0).max(120) })).max(6).default([]),
});

export type Prefs = z.infer<typeof prefsSchema>;

/** Preferencias guardadas (o nada) → preferencias completas con valores por defecto. */
export function readPrefs(raw: unknown): Prefs {
  const r = prefsSchema.safeParse(raw ?? {});
  return r.success ? r.data : prefsSchema.parse({});
}

/** Actualización parcial validada. */
export const prefsUpdateSchema = prefsSchema.partial();
