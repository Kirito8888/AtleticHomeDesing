import "server-only";
import { GoogleGenAI, type Content } from "@google/genai";
import { z } from "zod";

import { ApiError } from "@/lib/api";
import { env } from "@/lib/env";

let client: GoogleGenAI | undefined;

export function gemini(): GoogleGenAI {
  const key = env().GEMINI_API_KEY;
  if (!key) throw new ApiError(503, "Astras AI no está configurado (falta GEMINI_API_KEY)");
  client ??= new GoogleGenAI({ apiKey: key });
  return client;
}

/** Tamaño máximo de lote que acepta la API de embeddings. */
const EMBED_BATCH = 100;

export type EmbedTask = "RETRIEVAL_DOCUMENT" | "RETRIEVAL_QUERY";

/**
 * Embeddings con gemini-embedding-001 recortados a GEMINI_EMBEDDING_DIM (768).
 * Google solo normaliza la salida de 3072 dimensiones, así que se normaliza
 * aquí (L2) para que distancia coseno y producto escalar coincidan.
 */
export async function embedTexts(texts: string[], taskType: EmbedTask): Promise<number[][]> {
  const { GEMINI_EMBEDDING_MODEL, GEMINI_EMBEDDING_DIM } = env();
  const out: number[][] = [];
  for (let i = 0; i < texts.length; i += EMBED_BATCH) {
    const batch = texts.slice(i, i + EMBED_BATCH);
    const res = await gemini().models.embedContent({
      model: GEMINI_EMBEDDING_MODEL,
      contents: batch,
      config: { taskType, outputDimensionality: GEMINI_EMBEDDING_DIM },
    });
    const vectors = res.embeddings?.map((e) => e.values ?? []) ?? [];
    if (vectors.length !== batch.length || vectors.some((v) => v.length !== GEMINI_EMBEDDING_DIM)) {
      throw new ApiError(502, "Respuesta de embeddings inesperada");
    }
    out.push(...vectors.map(l2normalize));
  }
  return out;
}

export function l2normalize(v: number[]): number[] {
  const norm = Math.sqrt(v.reduce((a, x) => a + x * x, 0)) || 1;
  return v.map((x) => x / norm);
}

/** Literal de pgvector: '[0.1,0.2,...]'. */
export function toVectorLiteral(v: number[]): string {
  return `[${v.join(",")}]`;
}

/**
 * Generación con salida JSON validada. El esquema zod se envía como
 * responseJsonSchema (Gemini restringe la decodificación) y se vuelve a
 * validar en el servidor por si el modelo devuelve algo fuera de contrato.
 */
export async function generateJson<T extends z.ZodType>(
  schema: T,
  params: { system: string; prompt: string | Content[]; temperature?: number; model?: string },
): Promise<{ data: z.infer<T>; model: string }> {
  const model = params.model ?? env().GEMINI_CHAT_MODEL;
  const { $schema: _ignored, ...jsonSchema } = z.toJSONSchema(schema) as Record<string, unknown>;
  void _ignored;
  const res = await gemini().models.generateContent({
    model,
    contents: params.prompt,
    config: {
      systemInstruction: params.system,
      temperature: params.temperature ?? 0.4,
      responseMimeType: "application/json",
      responseJsonSchema: jsonSchema,
    },
  });
  const text = res.text;
  if (!text) throw new ApiError(502, "Gemini no devolvió contenido");
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new ApiError(502, "Gemini devolvió JSON inválido");
  }
  const result = schema.safeParse(parsed);
  if (!result.success) throw new ApiError(502, "La respuesta de Gemini no cumple el esquema esperado");
  return { data: result.data, model };
}

export async function generateText(params: {
  system: string;
  contents: Content[];
  temperature?: number;
}): Promise<{ text: string; model: string; inputTokens?: number; outputTokens?: number }> {
  const model = env().GEMINI_CHAT_MODEL;
  const res = await gemini().models.generateContent({
    model,
    contents: params.contents,
    config: { systemInstruction: params.system, temperature: params.temperature ?? 0.3 },
  });
  if (!res.text) throw new ApiError(502, "Gemini no devolvió contenido");
  return {
    text: res.text,
    model,
    inputTokens: res.usageMetadata?.promptTokenCount,
    outputTokens: res.usageMetadata?.candidatesTokenCount,
  };
}
