import { z } from "zod";

/** v2.1 · Protocolo de fisio/readaptación compartible: fases con ejercicios y criterios. Puro. */
export const physioPhasesSchema = z
  .array(
    z.object({
      name: z.string().trim().min(1).max(80),
      goal: z.string().trim().max(200).optional(),
      maxPain: z.number().int().min(0).max(10),
      exercises: z.array(z.object({ name: z.string().trim().min(1).max(80), dose: z.string().trim().max(80).default("") })).max(15),
      criteria: z.array(z.object({ text: z.string().trim().min(1).max(160) })).max(10),
    }),
  )
  .min(1)
  .max(8);
export type PhysioPhases = z.infer<typeof physioPhasesSchema>;

/** Criterios cumplidos por fase: [fase][criterio]. */
export type Progress = boolean[][];

/** Ajusta el seguimiento a la forma actual del protocolo (si la dueña añade o quita fases/criterios). */
export function normalizeProgress(phases: PhysioPhases, raw: unknown): Progress {
  const prev = Array.isArray(raw) ? raw : [];
  return phases.map((p, i) => {
    const row = Array.isArray(prev[i]) ? (prev[i] as unknown[]) : [];
    return p.criteria.map((_, j) => row[j] === true);
  });
}

/** Fase actual: la primera con algún criterio sin cumplir (o la última). */
export function currentPhase(phases: PhysioPhases, progress: Progress): number {
  const i = phases.findIndex((p, k) => p.criteria.some((_, j) => !progress[k]?.[j]));
  return i === -1 ? phases.length - 1 : i;
}

/** ¿El dolor de hoy permite seguir en la fase? */
export function painAllows(phases: PhysioPhases, phase: number, pain: number): boolean {
  return pain <= phases[phase].maxPain;
}

export function completion(phases: PhysioPhases, progress: Progress): { done: number; total: number; pct: number } {
  const total = phases.reduce((s, p) => s + p.criteria.length, 0);
  const done = progress.reduce((s, r, i) => s + r.slice(0, phases[i]?.criteria.length ?? 0).filter(Boolean).length, 0);
  return { done, total, pct: total ? Math.round((done / total) * 100) : 0 };
}

const AREAS = ["HEAD_NECK", "SHOULDER", "ELBOW", "WRIST_HAND", "CHEST", "UPPER_BACK", "LOWER_BACK", "ABDOMEN", "HIP_GROIN", "GLUTE", "HAMSTRING", "QUADRICEPS", "KNEE", "CALF", "ACHILLES", "ANKLE", "FOOT", "OTHER"] as const;

/** Cuerpo de alta/edición de un protocolo (las fases se validan al guardar con `physioPhasesSchema`). */
export const protocolBody = z.object({
  title: z.string().trim().min(2).max(120),
  area: z.enum(AREAS).nullish(),
  notes: z.string().trim().max(1000).nullish(),
  phases: z.unknown(),
});

/**
 * Editor de texto (cómodo en el móvil):
 *   # Nombre de la fase | dolor máx 2 | objetivo opcional
 *   - Ejercicio: dosis
 *   ? Criterio para pasar de fase
 */
export function parsePhasesText(text: string): PhysioPhases {
  const phases: PhysioPhases = [];
  text.split(/\r?\n/).forEach((raw, i) => {
    const line = raw.trim();
    if (!line) return;
    const at = `Línea ${i + 1}`;
    if (line.startsWith("#")) {
      const [name, pain, goal] = line.slice(1).split("|").map((s) => s.trim());
      const m = /(\d+)\s*$/.exec(pain ?? "");
      phases.push({ name: name ?? "", maxPain: m ? Number(m[1]) : 2, ...(goal ? { goal } : {}), exercises: [], criteria: [] });
      return;
    }
    const cur = phases[phases.length - 1];
    if (!cur) throw new Error(`${at}: empieza cada fase con «# Nombre | dolor máx N»`);
    if (line.startsWith("-")) {
      const [name, ...dose] = line.slice(1).split(":");
      cur.exercises.push({ name: name.trim(), dose: dose.join(":").trim() });
    } else if (line.startsWith("?")) cur.criteria.push({ text: line.slice(1).trim() });
    else throw new Error(`${at}: usa «-» para ejercicios y «?» para criterios`);
  });
  return physioPhasesSchema.parse(phases);
}

export function phasesToText(phases: PhysioPhases): string {
  return phases
    .map((p) => [`# ${p.name} | dolor máx ${p.maxPain}${p.goal ? ` | ${p.goal}` : ""}`, ...p.exercises.map((e) => `- ${e.name}${e.dose ? `: ${e.dose}` : ""}`), ...p.criteria.map((c) => `? ${c.text}`)].join("\n"))
    .join("\n\n");
}
