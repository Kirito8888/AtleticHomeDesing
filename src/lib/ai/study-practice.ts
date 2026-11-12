import "server-only";

import { MAX_SOURCE_CHARS } from "@/lib/ai/flashcards";
import { assertAiAllowed } from "@/lib/ai/guard";
import { generateJson } from "@/lib/ai/llm";
import { ApiError } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { requireModule } from "@/lib/study/modules-service";
import {
  buildPracticePrompt,
  buildReviewPrompt,
  fakePractice,
  fakeReview,
  normalizeExercises,
  normalizeReview,
  pickChunksForFocus,
  type PracticeExercise,
  type PracticeRequest,
  type PracticeReview,
  practiceAiSchema,
  type ReviewRequest,
  reviewAiSchema,
} from "@/lib/study/practice";

const fakeAi = () => process.env.LIFEOS_FAKE_AI === "1";

/** Propone ejercicios basados solo en los apuntes procesados de la asignatura. No escribe nada. */
export async function generatePractice(userId: string, req: PracticeRequest): Promise<{ exercises: PracticeExercise[]; model: string }> {
  const m = await requireModule(userId, req.moduleId);
  const docs = await prisma.studyDocument.findMany({
    where: { userId, moduleId: m.id, status: "EMBEDDED", ...(req.documentIds.length ? { id: { in: req.documentIds } } : {}) },
    include: { chunks: { orderBy: { chunkIndex: "asc" }, select: { content: true } } },
  });
  const chunks = docs.flatMap((d) => d.chunks);
  if (!chunks.length) throw new ApiError(409, "No hay apuntes procesados para practicar. Mete o elige alguno.");
  const sources = pickChunksForFocus(chunks, req.focus, MAX_SOURCE_CHARS).map((c) => c.content).join("\n\n").slice(0, MAX_SOURCE_CHARS);

  let raw;
  let model = "simulado";
  if (fakeAi()) raw = fakePractice(sources, req.count);
  else {
    await assertAiAllowed(userId);
    const p = buildPracticePrompt({ moduleName: m.name, count: req.count, focus: req.focus, mode: req.mode, exclude: req.exclude, sources });
    const r = await generateJson(practiceAiSchema, { userId, system: p.system, prompt: p.prompt, temperature: 0.4 });
    raw = r.data;
    model = r.model;
  }
  const exercises = normalizeExercises(raw, sources, req.count);
  if (!exercises.length) throw new ApiError(502, "La IA no devolvió ejercicios utilizables. Inténtalo de nuevo.");
  return { exercises, model };
}

/** Corrige el código escrito por la usuaria con IA (sin ejecutarlo). No escribe nada. */
export async function reviewPractice(userId: string, req: ReviewRequest): Promise<{ review: PracticeReview; model: string }> {
  await requireModule(userId, req.moduleId);
  let raw;
  let model = "simulado";
  if (fakeAi()) raw = fakeReview(req.answer);
  else {
    await assertAiAllowed(userId);
    const p = buildReviewPrompt({ exercise: req.exercise, answer: req.answer });
    const r = await generateJson(reviewAiSchema, { userId, system: p.system, prompt: p.prompt, temperature: 0.2 });
    raw = r.data;
    model = r.model;
  }
  return { review: normalizeReview(raw, req.answer), model };
}
