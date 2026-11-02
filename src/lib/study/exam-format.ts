// Formato del examen de una asignatura (lo responde la usuaria antes de generar el paquete de un tema).
// Contenido (teórico / práctico) × forma (test / desarrollo). Lógica pura: sin React, sin BD.
import { z } from "zod";

/** Tipos de pregunta que puede haber en un examen. `practiceCmd` es la terminal del juego (siempre que haya «Práctico»). */
export const KINDS = ["theoryTest", "theoryEssay", "practiceCmd", "practiceTest", "practiceEssay"] as const;
export type Kind = (typeof KINDS)[number];

export const KIND_LABEL: Record<Kind, string> = {
  theoryTest: "Teoría · test",
  theoryEssay: "Teoría · desarrollo",
  practiceCmd: "Práctica · terminal",
  practiceTest: "Práctica · test",
  practiceEssay: "Práctica · desarrollo",
};

/** Examen original del juego: 20 de teoría + 12 prácticas, 35 minutos. */
export const DEFAULT_QUESTIONS = 32;
export const DEFAULT_MINUTES = 35;

export const examFormatSchema = z
  .object({
    theory: z.boolean(),
    practical: z.boolean(),
    test: z.boolean(),
    essay: z.boolean(),
    /** Peso (%) por tipo activo. Si falta, reparto igual; si está, debe sumar 100 entre los tipos activos. */
    weights: z.partialRecord(z.enum(KINDS), z.number().int().min(0).max(100)).optional(),
    minutes: z.number().int().min(5).max(240).default(DEFAULT_MINUTES),
    questions: z.number().int().min(4).max(80).default(DEFAULT_QUESTIONS),
  })
  .superRefine((f, ctx) => {
    if (!f.theory && !f.practical) ctx.addIssue({ code: "custom", message: "Elige teórico, práctico o ambos.", path: ["theory"] });
    if (f.theory && !f.test && !f.essay) ctx.addIssue({ code: "custom", message: "Para teoría elige test, desarrollo o ambos.", path: ["test"] });
    if (f.weights) {
      const active = activeKinds(f);
      const sum = active.reduce((a, k) => a + (f.weights?.[k] ?? 0), 0);
      if (sum !== 100) ctx.addIssue({ code: "custom", message: "Los pesos de los tipos elegidos deben sumar 100.", path: ["weights"] });
    }
  });
export type ExamFormat = z.infer<typeof examFormatSchema>;

/** Formato por defecto de las asignaturas que aún no han respondido: test teórico + terminal (lo que ya hacía el juego). */
export const DEFAULT_FORMAT: ExamFormat = { theory: true, practical: true, test: true, essay: false, minutes: DEFAULT_MINUTES, questions: DEFAULT_QUESTIONS };

/**
 * Tipos de pregunta activos para un formato, en orden estable.
 * - Teoría: test y/o desarrollo según las casillas. Práctico: siempre la terminal del juego.
 * - Test / desarrollo **de práctica** (elegir el comando, caso práctico abierto): solo si no hay teoría
 *   (entonces la forma elegida aplica a lo práctico) o si el formato les da peso explícito.
 */
export function activeKinds(f: Pick<ExamFormat, "theory" | "practical" | "test" | "essay"> & { weights?: ExamFormat["weights"] }): Kind[] {
  const k: Kind[] = [];
  const weighted = (x: Kind) => (f.weights?.[x] ?? 0) > 0;
  if (f.theory && f.test) k.push("theoryTest");
  if (f.theory && f.essay) k.push("theoryEssay");
  if (f.practical) k.push("practiceCmd");
  if (f.practical && f.test && (!f.theory || weighted("practiceTest"))) k.push("practiceTest");
  if (f.practical && f.essay && (!f.theory || weighted("practiceEssay"))) k.push("practiceEssay");
  return k;
}

/** Interpreta lo guardado en BD (JSON suelto): lo inválido o ausente cae al formato por defecto. */
export function parseFormat(raw: unknown): ExamFormat {
  const r = examFormatSchema.safeParse(raw);
  return r.success ? r.data : DEFAULT_FORMAT;
}

/**
 * Reparte `total` preguntas entre los tipos activos según los pesos (resto por mayor fracción; empates por orden estable).
 * Con pesos ausentes o a cero en todos, reparto igual. Cada tipo con peso > 0 recibe al menos 1 si `total` lo permite.
 */
export function allocate(f: ExamFormat, total: number): Partial<Record<Kind, number>> {
  const active = activeKinds(f);
  const out: Partial<Record<Kind, number>> = {};
  if (!active.length || total <= 0) return out;
  const raw = active.map((k) => f.weights?.[k] ?? 0);
  const w = raw.some((x) => x > 0) ? raw : active.map(() => 1);
  const sum = w.reduce((a, b) => a + b, 0);
  const exact = w.map((x) => (x / sum) * total);
  const base = exact.map(Math.floor);
  // Garantiza 1 a los tipos con peso cuando hay hueco.
  const need = w.map((x, i) => (x > 0 && base[i] === 0 ? 1 : 0));
  if (total >= need.filter(Boolean).length + 0) base.forEach((_, i) => (base[i] = Math.max(base[i], need[i])));
  let left = total - base.reduce((a, b) => a + b, 0);
  const order = exact.map((e, i) => ({ i, frac: e - Math.floor(e) })).sort((a, b) => b.frac - a.frac || a.i - b.i);
  for (let n = 0; left > 0; n++, left--) base[order[n % order.length].i]++;
  // Si la garantía de 1 se pasó del total, quita al tipo con más.
  while (left < 0) {
    const m = base.indexOf(Math.max(...base));
    base[m]--;
    left++;
  }
  active.forEach((k, i) => {
    if (base[i] > 0) out[k] = base[i];
  });
  return out;
}

/** Preguntas por nivel (tema): 10 como en el juego original. */
export const LEVEL_QUESTIONS = 10;
/** Preguntas del Jefe de un tema: ~60 % del examen, mínimo 4. */
export const bossQuestions = (f: ExamFormat) => Math.max(4, Math.round(f.questions * 0.6));
