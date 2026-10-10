import "server-only";
import { z } from "zod";

import { aiFor, extractJson, type ChatTurn, type EmbedTask } from "@/lib/ai/provider";
import { ApiError } from "@/lib/api";

/**
 * Generación y embeddings con la IA del dueño de los datos (`userId`): la suya propia
 * (Ajustes → IA) o, si no tiene, la del servidor. Antes de llamar aquí, assertAiAllowed(userId).
 */

/**
 * Salida JSON validada. El esquema zod se envía al proveedor (Gemini lo impone al decodificar)
 * y se vuelve a validar aquí por si el modelo devuelve algo fuera de contrato.
 */
export async function generateJson<T extends z.ZodType>(
  schema: T,
  params: { userId: string; system: string; prompt: string; temperature?: number; images?: ChatTurn["images"] },
): Promise<{ data: z.infer<T>; model: string }> {
  const ai = await aiFor(params.userId);
  const { $schema: _ignored, ...jsonSchema } = z.toJSONSchema(schema) as Record<string, unknown>;
  void _ignored;
  const res = await ai.text({ system: params.system, messages: [{ role: "user", text: params.prompt, images: params.images }], temperature: params.temperature ?? 0.4, json: jsonSchema });
  let parsed: unknown;
  try {
    parsed = extractJson(res.text);
  } catch {
    throw new ApiError(502, "La IA devolvió JSON inválido");
  }
  const result = schema.safeParse(parsed);
  if (!result.success) throw new ApiError(502, "La respuesta de la IA no cumple el esquema esperado");
  return { data: result.data, model: ai.chatModel };
}

export async function generateText(params: { userId: string; system: string; messages: ChatTurn[]; temperature?: number }): Promise<{ text: string; model: string; inputTokens?: number; outputTokens?: number }> {
  const ai = await aiFor(params.userId);
  const res = await ai.text({ system: params.system, messages: params.messages, temperature: params.temperature ?? 0.3 });
  return { ...res, model: ai.chatModel };
}

/** Embeddings normalizados (L2) y la etiqueta del modelo, o null si su IA no tiene embeddings. */
export async function embedTexts(userId: string, texts: string[], task: EmbedTask): Promise<{ vectors: number[][]; tag: string } | null> {
  const ai = await aiFor(userId);
  if (!ai.embed || !ai.embedTag) return null;
  return { vectors: await ai.embed(texts, task), tag: ai.embedTag };
}

/** Etiqueta de los embeddings del usuario (null = búsqueda por texto). */
export async function embedTagFor(userId: string): Promise<string | null> {
  return (await aiFor(userId)).embedTag;
}

/** Literal de pgvector: '[0.1,0.2,...]'. */
export function toVectorLiteral(v: number[]): string {
  return `[${v.join(",")}]`;
}
