import "server-only";

import { MAX_SOURCE_CHARS, sampleChunks } from "@/lib/ai/flashcards";
import { assertAiAllowed } from "@/lib/ai/guard";
import { generateJson } from "@/lib/ai/llm";
import { MIN_SCORE, searchChunks } from "@/lib/ai/rag";
import { ApiError } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { requireModule } from "@/lib/study/modules-service";
import { packItems } from "@/lib/ai/study-pack";
import { bossQuestions, parseFormat } from "@/lib/study/exam-format";
import { composeExam } from "@/lib/study/pack-exam";
import { BOSS_ID, FINAL_ID } from "@/lib/study/quest";
import { buildQuestPrompt, fakeQuest, MIN_QUEST_ITEMS, normalizeQuest, QUEST_COUNTS, type QuestRequest, questAiSchema } from "@/lib/study/quest-ai";
import type { QuestItem } from "@/lib/study/quest-mock";

const fakeAi = () => process.env.LIFEOS_FAKE_AI === "1";

export interface QuestResponse {
  items: QuestItem[];
  model: string;
  /** `pack` = preguntas guardadas del paquete del tema (sin llamar a la IA); `ai` = generadas ahora desde los apuntes. */
  source: "pack" | "ai";
  /** Examen final: minutos del cronómetro. */
  minutes?: number;
}

/**
 * Preguntas de un nivel (tema), del Jefe o del examen final. Si el tema (o los temas) tienen **paquete** generado, se sirven las
 * guardadas, sin llamar a la IA; si no, se generan al momento desde los apuntes de la asignatura (RAG). No escribe nada.
 *
 * @throws {ApiError} 404 asignatura o tema ajeno · 409 sin apuntes (o, en el examen final, sin ningún paquete) · 502 la IA no dio preguntas.
 */
export async function generateQuest(userId: string, req: QuestRequest): Promise<QuestResponse> {
  const m = await requireModule(userId, req.moduleId);
  const format = parseFormat(m.examFormat);
  const boss = req.nodeId === BOSS_ID;
  if (req.nodeId === FINAL_ID || boss) {
    const topics = await prisma.studyTopic.findMany({ where: { moduleId: m.id, userId }, select: { id: true } });
    const all = (await Promise.all(topics.map((t) => packItems(userId, t.id)))).flat();
    const total = req.nodeId === FINAL_ID ? format.questions : bossQuestions(format);
    const items = composeExam(all, format, total);
    if (items.length >= MIN_QUEST_ITEMS) return { items, model: "paquete", source: "pack", ...(req.nodeId === FINAL_ID ? { minutes: format.minutes } : {}) };
    if (req.nodeId === FINAL_ID) throw new ApiError(409, "Genera el paquete de estudio de al menos un tema para hacer el examen final.");
  } else {
    const own = await packItems(userId, req.nodeId);
    if (own.length >= MIN_QUEST_ITEMS) return { items: own, model: "paquete", source: "pack" };
  }
  const topic = boss ? null : await prisma.studyTopic.findFirst({ where: { id: req.nodeId, moduleId: m.id, userId } });
  if (!boss && !topic) throw new ApiError(404, "Ese nivel no existe en esta asignatura.");

  const docs = await prisma.studyDocument.findMany({
    where: { userId, moduleId: m.id, status: "EMBEDDED" },
    include: { chunks: { orderBy: { chunkIndex: "asc" }, select: { content: true } } },
  });
  const all = docs.flatMap((d) => d.chunks);
  if (!all.length) throw new ApiError(409, "Esta asignatura no tiene apuntes procesados. Sube alguno para jugar.");

  let chunks = all;
  if (topic) {
    const found = (await searchChunks(userId, topic.name, 12, docs.map((d) => d.id))).filter((c) => Number(c.score) >= MIN_SCORE);
    // Sin coincidencias claras, se reparte por todos los apuntes en vez de dejar el nivel vacío.
    if (found.length) chunks = found;
  }
  const sources = sampleChunks(chunks).map((c) => c.content).join("\n\n").slice(0, MAX_SOURCE_CHARS);

  let raw;
  let model = "simulado";
  if (fakeAi()) raw = fakeQuest(sources);
  else {
    await assertAiAllowed(userId);
    const p = buildQuestPrompt({ moduleName: m.name, nodeTitle: topic?.name ?? "Jefe Final (toda la asignatura)", counts: QUEST_COUNTS, sources });
    const r = await generateJson(questAiSchema, { userId, system: p.system, prompt: p.prompt, temperature: 0.3 });
    raw = r.data;
    model = r.model;
  }
  const items = normalizeQuest(raw, sources, req.nodeId);
  if (items.length < MIN_QUEST_ITEMS) throw new ApiError(502, "La IA no devolvió preguntas utilizables con tus apuntes. Inténtalo de nuevo.");
  return { items, model, source: "ai" };
}
