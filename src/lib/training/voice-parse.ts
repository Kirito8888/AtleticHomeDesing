import { z } from "zod";

import { nameKey } from "./rm";

/**
 * Del dictado («sentadilla 3 por 5 a 90 kilos RIR 2, press banca 4x6 con 60,
 * 50 minutos, RPE 7») a un borrador de sesión de fuerza. Puro: es el respaldo
 * sin IA y el simulador de la CI; con Gemini se usa el mismo esquema.
 */
export const spokenSchema = z.object({
  durationMin: z.number().int().min(1).max(400).nullable(),
  rpe: z.number().min(1).max(10).nullable(),
  items: z
    .array(
      z.object({
        exercise: z.string().min(1).max(80),
        sets: z.number().int().min(1).max(20),
        reps: z.number().int().min(1).max(100),
        kg: z.number().min(0).max(500).nullable(),
        rir: z.number().int().min(0).max(10).nullable(),
      }),
    )
    .max(20),
});
export type Spoken = z.infer<typeof spokenSchema>;

const NUM_WORDS: Record<string, number> = { un: 1, una: 1, uno: 1, dos: 2, tres: 3, cuatro: 4, cinco: 5, seis: 6, siete: 7, ocho: 8, nueve: 9, diez: 10, once: 11, doce: 12, quince: 15, veinte: 20 };

function normalize(text: string): string {
  let t = text.toLowerCase().replace(/(\d),(\d)/g, "$1.$2");
  for (const [w, n] of Object.entries(NUM_WORDS)) t = t.replace(new RegExp(`\\b${w}\\b`, "g"), String(n));
  return t
    .replace(/\s*(?:x|×|por)\s*(?=\d)/g, " x ")
    .replace(/\s+/g, " ")
    .trim();
}

export function parseSpoken(text: string): Spoken {
  const t = normalize(text);
  const durationMin = Number(/(\d+)\s*(?:min|minutos)\b/.exec(t)?.[1] ?? NaN);
  const rpe = Number(/\brpe\s*(\d+(?:\.\d)?)/.exec(t)?.[1] ?? NaN);
  const items: Spoken["items"] = [];
  // Cada ejercicio: «nombre N x M [a|con] K [kg|kilos] [rir R]», separados por comas, «y» o punto
  for (const part of t.split(/[,;]|\.(?!\d)|\by\b(?=\s+[a-zñ])/)) {
    const m = /^\s*([a-zñáéíóúü][a-zñáéíóúü ]*?)\s+(\d+)\s*x\s*(\d+)(?:\s*(?:a|con|@)?\s*(\d+(?:\.\d+)?)\s*(?:kg|kilos|k)?)?(?:\s*rir\s*(\d+))?/.exec(part);
    if (!m) continue;
    const exercise = m[1].replace(/\b(de|series|serie|hice|he hecho)\b/g, " ").replace(/\s+/g, " ").trim();
    if (!exercise) continue;
    items.push({ exercise, sets: Number(m[2]), reps: Number(m[3]), kg: m[4] ? Number(m[4]) : null, rir: m[5] ? Number(m[5]) : null });
  }
  return { durationMin: Number.isFinite(durationMin) ? durationMin : null, rpe: Number.isFinite(rpe) ? rpe : null, items: items.slice(0, 20) };
}

/** Busca el ejercicio del catálogo: igual, luego el que contiene el dictado o al revés (el más corto). */
export function matchExercise(spoken: string, catalog: Array<{ id: string; name: string }>): { id: string; name: string } | null {
  const k = nameKey(spoken);
  if (!k) return null;
  const keyed = catalog.map((c) => ({ ...c, key: nameKey(c.name) }));
  const exact = keyed.find((c) => c.key === k);
  if (exact) return exact;
  const cands = keyed.filter((c) => c.key.startsWith(k) || c.key.includes(` ${k}`) || k.startsWith(c.key));
  return cands.sort((a, b) => a.key.length - b.key.length)[0] ?? null;
}
