import "server-only";

import { loadSampledChunks, MAX_SOURCE_CHARS } from "@/lib/ai/flashcards";
import { assertAiAllowed } from "@/lib/ai/guard";
import { generateJson } from "@/lib/ai/llm";
import { ApiError } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { requireModule } from "@/lib/study/modules-service";
import { daysLeft } from "@/lib/study/study-route";
import { toIsoDay, today } from "@/lib/dates";
import type { Tag } from "@/lib/study/adhd-report";
import { buildSelfTestPrompt, fakeSelfTest, normalizeTest, planMix, type SelfTestRequest, selfTestAiSchema, type TestQuestion } from "@/lib/study/self-test";

const fakeAi = () => process.env.LIFEOS_FAKE_AI === "1";
const asTag = (s: string): Tag => (s === "red" || s === "grey" ? s : "yellow");

/** Redacta un test sobre los apuntes de la asignatura. No escribe nada: el resultado vive en el cliente. */
export async function generateSelfTest(userId: string, req: SelfTestRequest): Promise<{ questions: TestQuestion[]; model: string }> {
  const m = await requireModule(userId, req.moduleId);
  const [topicRows, docs] = await Promise.all([
    prisma.studyTopic.findMany({ where: { moduleId: m.id, userId }, orderBy: [{ position: "asc" }, { createdAt: "asc" }] }),
    prisma.studyDocument.findMany({
      where: { userId, moduleId: m.id, status: "EMBEDDED" },
      select: { id: true },
    }),
  ]);
  const docIds = docs.map((d) => d.id);
  if (!docIds.length || !(await prisma.documentChunk.findFirst({ where: { userId, documentId: { in: docIds } }, select: { id: true } }))) throw new ApiError(409, "Esta asignatura no tiene apuntes procesados. Mete alguno para evaluarte.");
  if (!topicRows.length) throw new ApiError(422, "Añade al menos un tema a la asignatura.");
  const topics = topicRows.map((t) => ({ name: t.name, tag: asTag(t.tag), done: t.done }));
  const left = daysLeft(toIsoDay(today()), m.examDate ? toIsoDay(m.examDate) : null);
  const mix = planMix({ topics, daysLeft: left, weak: req.weak, count: req.count });
  const sources = (await loadSampledChunks(userId, docIds)).map((c) => c.content).join("\n\n").slice(0, MAX_SOURCE_CHARS);

  let raw;
  let model = "simulado";
  if (fakeAi()) raw = fakeSelfTest(sources, mix);
  else {
    await assertAiAllowed(userId);
    const p = buildSelfTestPrompt({ moduleName: m.name, daysLeft: left, mix, sources });
    const r = await generateJson(selfTestAiSchema, { userId, system: p.system, prompt: p.prompt, temperature: 0.3 });
    raw = r.data;
    model = r.model;
  }
  const questions = normalizeTest(raw, sources, topics, req.count);
  if (questions.length < 3) throw new ApiError(502, "La IA no devolvió un test utilizable. Inténtalo de nuevo.");
  return { questions, model };
}
