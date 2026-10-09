import { z } from "zod";

import { compMealSchema, DEFAULT_COMP_MEALS } from "@/lib/nutrition/kitchen";

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
  /** Sensaciones al cerrar la sesión: avisar por encima de este dolor. */
  feelingPainMax: z.number().int().min(0).max(10).default(4),
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
  // --- v1.5 ---
  /** Monotonía de Foster (media / desviación de la carga diaria de 7 días): aviso por encima. */
  monotonyMax: z.number().min(1).max(5).default(2),
  /** Sueño: horas objetivo y deuda de 7 días a partir de la que se avisa. */
  sleepTargetH: z.number().min(5).max(12).default(8),
  sleepDebtMaxH: z.number().min(1).max(30).default(5),
  /** Hidratación: ml por kg de peso, extra en días con sesión y en días de calor (≥ hotTempC). */
  waterMlPerKg: z.number().int().min(20).max(60).default(35),
  waterSessionExtraMl: z.number().int().min(0).max(3000).default(500),
  waterHotExtraMl: z.number().int().min(0).max(3000).default(500),
  hotTempC: z.number().min(15).max(45).default(28),
  /** Pista habitual (para las condiciones de Open-Meteo). Solo coordenadas: nada personal. */
  track: z.object({ name: z.string().min(1).max(60), lat: z.number().min(-90).max(90), lon: z.number().min(-180).max(180) }).nullable().default(null),
  /** Calentamiento de competición por bloques (minutos). */
  warmupBlocks: z
    .array(z.object({ name: z.string().min(1).max(40), minutes: z.number().int().min(1).max(60) }))
    .min(1)
    .max(12)
    .default([
      { name: "Movilidad y activación", minutes: 10 },
      { name: "Carrera y técnica de carrera", minutes: 10 },
      { name: "Lanzamientos de calentamiento", minutes: 15 },
      { name: "Activación final y concentración", minutes: 5 },
    ]),
  /** VBT: velocidad mínima a la que sale la RM (m/s) y pérdida de velocidad para avisar (%). */
  vbtMvt: z.number().min(0.1).max(1).default(0.3),
  vbtLossMax: z.number().min(5).max(60).default(20),
  /** v1.6 · kg del día autorregulados: cuánto pueden alejarse del plan (%) como mucho. */
  autoregMaxPct: z.number().min(0).max(20).default(5),
  /** v1.6 · afinamiento antes de una competición A: días antes y % de series que se recortan. */
  taperDays: z.number().int().min(2).max(21).default(7),
  taperPct: z.number().int().min(10).max(60).default(30),
  /** v1.6 · semáforo del día: readiness por debajo de (ámbar / rojo), índice Hooper desde (ámbar / rojo), dolor desde (rojo) y fatiga de una zona desde (ámbar). */
  lightReadinessAmber: z.number().int().min(0).max(100).default(60),
  lightReadinessRed: z.number().int().min(0).max(100).default(40),
  lightHooperAmber: z.number().int().min(4).max(20).default(14),
  lightHooperRed: z.number().int().min(4).max(20).default(17),
  lightPainRed: z.number().int().min(1).max(10).default(6),
  lightZoneAmber: z.number().int().min(1).max(10).default(7),
  /** v1.6 · comida del día de competición (plantilla genérica editable). */
  compMeals: z.array(compMealSchema).max(10).default(DEFAULT_COMP_MEALS),
  /** v1.6 · plan de estudio: minutos al día como mucho, recorte en días de entreno, bloque y horas por examen (por defecto y por id). */
  studyDailyMin: z.number().int().min(30).max(720).default(180),
  studyTrainingCutMin: z.number().int().min(0).max(300).default(60),
  studyBlockMin: z.number().int().min(15).max(120).default(30),
  studyHoursPerExam: z.number().min(1).max(300).default(15),
  examHours: z.record(z.string().max(40), z.number().min(0).max(300)).default({}),
  /** v1.6 · añadir clases y exámenes (solo la asignatura) al calendario .ics. */
  icsStudy: z.boolean().default(false),
  /** Mapeo del CSV de VFC y sueño (se recuerda para la próxima importación). */
  hrvCsvMapping: z
    .object({
      delimiter: z.enum([";", ",", "\t"]),
      dateCol: z.number().int().min(0),
      dateFormat: z.enum(["YYYY-MM-DD", "DD/MM/YYYY", "MM/DD/YYYY", "DD-MM-YYYY"]),
      hrvCol: z.number().int().min(0).nullable(),
      rhrCol: z.number().int().min(0).nullable(),
      sleepCol: z.number().int().min(0).nullable(),
      sleepUnit: z.enum(["h", "min"]),
    })
    .nullable()
    .default(null),
});

export type Prefs = z.infer<typeof prefsSchema>;

/** Preferencias guardadas (o nada) → preferencias completas con valores por defecto. */
export function readPrefs(raw: unknown): Prefs {
  const r = prefsSchema.safeParse(raw ?? {});
  return r.success ? r.data : prefsSchema.parse({});
}

/** Actualización parcial validada. */
export const prefsUpdateSchema = prefsSchema.partial();

/**
 * Valida un cambio parcial y devuelve SOLO las claves que vienen en él.
 * Ojo: en zod 4, `.partial()` sigue aplicando los `.default()`, así que
 * `partial().parse({ a: 1 })` devuelve también el resto con su valor por
 * defecto y pisaría lo guardado.
 */
export function pickPatch<T extends Record<string, unknown>>(schema: { parse: (v: unknown) => T }, raw: unknown): Partial<T> {
  const parsed = schema.parse(raw ?? {});
  const keys = raw && typeof raw === "object" ? Object.keys(raw) : [];
  return Object.fromEntries(Object.entries(parsed).filter(([k]) => keys.includes(k))) as Partial<T>;
}
