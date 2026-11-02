// Paquete de un tema: resumen por prioridad + banco del juego. La IA genera JSON (nunca HTML) y se valida aquí.
// Lógica pura: esquemas zod, validación semántica contra las fuentes y adaptadores a los tipos del motor del juego.
import { z } from "zod";

import { commandAnchored, shortHash, squash, unquote } from "./quest-ai";
import type { Essay, QuestItem } from "./quest-mock";
import type { Practice, Shell, Theory } from "./quest-engine";

const text = (max: number) => z.string().trim().min(1).max(max);
const evidence = text(500);

// ───────────────────────── Resumen ─────────────────────────

export const LEVEL_KEYS = ["safe", "probable", "extra"] as const;
export type LevelKey = (typeof LEVEL_KEYS)[number];
export const LEVEL_LABEL: Record<LevelKey, string> = { safe: "Cae seguro", probable: "Probable", extra: "Si sobra tiempo" };

export const summaryBlockSchema = z.object({
  title: text(120),
  /** Máximo 4 viñetas por bloque. */
  concepts: z.array(text(200)).max(4),
  commands: z.array(z.object({ syntax: text(200), options: z.array(text(160)).max(12), typicalError: text(200), paths: z.array(text(160)).max(8) })).max(8),
  tables: z.array(z.object({ title: text(120), headers: z.array(text(60)).min(2).max(6), rows: z.array(z.array(text(160)).min(2).max(6)).min(1).max(12) })).max(3),
  traps: z.array(text(200)).max(5),
  mnemonics: z.array(text(200)).max(4),
  /** Erratas del temario detectadas (se muestran aparte con la etiqueta «Errata»). */
  errata: z.array(text(300)).max(5),
  evidence,
});
export type SummaryBlock = z.infer<typeof summaryBlockSchema>;

export const summarySchema = z.object({
  topic: text(160),
  levels: z.object({ safe: z.array(summaryBlockSchema).max(12), probable: z.array(summaryBlockSchema).max(12), extra: z.array(summaryBlockSchema).max(12) }),
  /** «Si solo tengo 10 minutos»: exactamente 5 puntos. */
  tenMinutes: z.array(text(200)).length(5),
  /** Autoevaluación: 10 preguntas + 2 prácticos; las soluciones van aparte, en el mismo orden. */
  selfTest: z.object({ questions: z.array(text(300)).length(10), practicals: z.array(text(300)).length(2) }),
  solutions: z.object({ questions: z.array(text(400)).length(10), practicals: z.array(text(400)).length(2) }),
});
export type Summary = z.infer<typeof summarySchema>;

// ───────────────────────── Banco del juego ─────────────────────────

export const mcqSchema = z.object({
  question: text(400),
  options: z.array(text(250)).length(4),
  /** Índice (0–3) de la opción correcta. */
  correct: z.number().int().min(0).max(3),
  explanation: text(500),
  evidence,
});
export const essaySchema = z.object({ question: text(400), modelAnswer: text(900), keyPoints: z.array(text(250)).min(3).max(6), explanation: text(500), evidence });
export const commandSchema = z.object({
  prompt: text(400),
  solution: text(300),
  /** Otras formas equivalentes de resolverlo. */
  validVariants: z.array(text(300)).max(5),
  explanation: text(500),
  shell: z.enum(["b", "p", "c"]).default("b"),
  evidence,
});
/** Un lote = un subtema (o el Jefe). Todos los campos tienen valor por defecto: el lote puede traer solo los tipos pedidos. */
export const gameBatchSchema = z.object({
  theoryTest: z.array(mcqSchema).max(20).default([]),
  theoryEssay: z.array(essaySchema).max(20).default([]),
  practiceCmd: z.array(commandSchema).max(20).default([]),
  practiceTest: z.array(mcqSchema).max(20).default([]),
  practiceEssay: z.array(essaySchema).max(20).default([]),
});
export type GameBatch = z.infer<typeof gameBatchSchema>;
/** Lo que se guarda en BD: un lote por nivel (clave = id del lote) y uno para el Jefe. */
export const gameSchema = z.object({ levels: z.record(z.string(), gameBatchSchema), boss: gameBatchSchema.optional() });
export type Game = z.infer<typeof gameSchema>;

// ───────────────────────── Validación semántica ─────────────────────────

/** La cita aparece literalmente (≥ 8 car.) en las fuentes. */
export function isCited(ev: string, sourceText: string): boolean {
  const e = squash(unquote(ev));
  return e.length >= 8 && squash(unquote(sourceText)).includes(e);
}

const NOT_IN_SOURCES = /no est[aá] en las fuentes/i;

/**
 * Quita del lote lo que no respalda el texto fuente: sin cita literal, con «no está en las fuentes», repetido,
 * opciones duplicadas, o comandos/opciones que no aparecen en los apuntes. Devuelve el lote limpio y cuántos descartó.
 */
export function sanitizeBatch(b: GameBatch, sourceText: string): { batch: GameBatch; dropped: number } {
  let dropped = 0;
  const seen = new Set<string>();
  const fresh = (q: string) => {
    const k = squash(q);
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  };
  const mcq = (arr: z.infer<typeof mcqSchema>[]) =>
    arr.filter((q) => {
      const distinct = new Set(q.options.map((o) => squash(o))).size === 4;
      const ok = distinct && isCited(q.evidence, sourceText) && !q.options.some((o) => NOT_IN_SOURCES.test(o)) && !NOT_IN_SOURCES.test(q.explanation) && fresh(q.question);
      if (!ok) dropped++;
      return ok;
    });
  const essay = (arr: z.infer<typeof essaySchema>[]) =>
    arr.filter((q) => {
      const ok = isCited(q.evidence, sourceText) && !NOT_IN_SOURCES.test(q.modelAnswer) && fresh(q.question);
      if (!ok) dropped++;
      return ok;
    });
  const cmd = (arr: z.infer<typeof commandSchema>[]) =>
    arr.filter((q) => {
      const all = [q.solution, ...q.validVariants];
      const ok = all.every((c) => !/[\r\n]/.test(c) && c.length <= 200 && commandAnchored(c, q.shell, sourceText)) && isCited(q.evidence, sourceText) && fresh(q.prompt);
      if (!ok) dropped++;
      return ok;
    });
  return {
    batch: { theoryTest: mcq(b.theoryTest), theoryEssay: essay(b.theoryEssay), practiceCmd: cmd(b.practiceCmd), practiceTest: mcq(b.practiceTest), practiceEssay: essay(b.practiceEssay) },
    dropped,
  };
}

/** Validación semántica del resumen: la cita de cada bloque debe estar en las fuentes (los bloques sin ella se descartan). */
export function sanitizeSummary(s: Summary, sourceText: string): { summary: Summary; dropped: number } {
  let dropped = 0;
  const keep = (arr: SummaryBlock[]) =>
    arr.filter((b) => {
      const ok = isCited(b.evidence, sourceText);
      if (!ok) dropped++;
      return ok;
    });
  return { summary: { ...s, levels: { safe: keep(s.levels.safe), probable: keep(s.levels.probable), extra: keep(s.levels.extra) } }, dropped };
}

// ───────────────────────── Adaptadores al motor del juego ─────────────────────────

/** Opción correcta primero (el motor baraja y reconoce la correcta por su posición `t[1][0]`). */
export function mcqToTheory(q: z.infer<typeof mcqSchema>): Theory {
  const correct = q.options[q.correct];
  return [q.question, [correct, ...q.options.filter((_, i) => i !== q.correct)], q.explanation];
}

export function commandToPractice(q: z.infer<typeof commandSchema>): Practice {
  return { q: q.prompt, sol: q.solution, ok: q.validVariants, sh: q.shell as Shell, exp: q.explanation };
}

export function essayToEssay(q: z.infer<typeof essaySchema>): Essay {
  return { q: q.question, model: q.modelAnswer, points: q.keyPoints, exp: q.explanation };
}

/**
 * Convierte un lote en preguntas del motor. Ids estables `pk:<nodo>:<hash>`: sirven para la mazmorra aunque se regenere otro paquete.
 *
 * @param nodeId Id del nivel (tema) o `boss`.
 */
export function batchToItems(b: GameBatch, nodeId: string): QuestItem[] {
  const id = (kind: string, q: string) => `pk:${nodeId}:${kind}:${shortHash(squash(q))}`;
  return [
    ...b.theoryTest.map((q): QuestItem => ({ id: id("tt", q.question), lid: nodeId, type: "t", t: mcqToTheory(q) })),
    ...b.practiceTest.map((q): QuestItem => ({ id: id("pt", q.question), lid: nodeId, type: "t", t: mcqToTheory(q) })),
    ...b.practiceCmd.map((q): QuestItem => ({ id: id("pc", q.prompt), lid: nodeId, type: "p", p: commandToPractice(q) })),
    ...b.theoryEssay.map((q): QuestItem => ({ id: id("te", q.question), lid: nodeId, type: "e", e: essayToEssay(q) })),
    ...b.practiceEssay.map((q): QuestItem => ({ id: id("pe", q.question), lid: nodeId, type: "e", e: essayToEssay(q) })),
  ];
}
