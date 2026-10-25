import "server-only";
import { z } from "zod";

import { assertAiAllowed } from "@/lib/ai/guard";
import { generateJson } from "@/lib/ai/llm";
import { loadSource, sourceSchema } from "@/lib/ai/study-adapt";
import { fakeSteps, type MicroSteps, normalizeSteps, STEP_LIMITS, stepsSchema } from "@/lib/study/micro-steps";

export const chunkRequestSchema = z.object({ source: sourceSchema });
export type ChunkRequest = z.infer<typeof chunkRequestSchema>;

const SYSTEM = `Eres un tutor que ayuda a empezar a estudiar un tema largo, en español.
- Usa SOLO la información del texto dado. No inventes ni añadas conocimiento externo.
- Devuelve "title" (el tema, máx. 8 palabras) y entre 4 y ${STEP_LIMITS.maxSteps} "steps" secuenciales.
- Cada paso: "action" = una acción concreta que empieza por un verbo (leer, copiar, explicar, ordenar…), máx. ${STEP_LIMITS.action} caracteres;
  "minutes" entre ${STEP_LIMITS.minMinutes} y ${STEP_LIMITS.maxMinutes}; "check" opcional = cómo sabe que lo terminó, máx. ${STEP_LIMITS.check} caracteres.
- El primer paso debe ser tan fácil que se pueda empezar sin esfuerzo (p. ej. abrir el material y leer el primer apartado).
- Sin markdown, sin negritas, sin comentarios clínicos ni sobre diagnósticos.`;

/** Divide el origen en micro-pasos. No escribe nada: los pasos viven en el cliente. */
export async function chunkStudyContent(userId: string, req: ChunkRequest): Promise<MicroSteps & { sourceLabel: string; model: string }> {
  const src = await loadSource(userId, req.source);
  if (process.env.LIFEOS_FAKE_AI === "1") return { ...normalizeSteps(fakeSteps(src.text)), sourceLabel: src.label, model: "simulado" };
  await assertAiAllowed(userId);
  const r = await generateJson(stepsSchema, { userId, system: SYSTEM, prompt: `Tema/origen: ${src.label}\n\nTEXTO:\n${src.text}`, temperature: 0.3 });
  return { ...normalizeSteps(r.data), sourceLabel: src.label, model: r.model };
}
