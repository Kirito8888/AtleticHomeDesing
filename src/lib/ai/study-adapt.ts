import "server-only";
import { z } from "zod";

import { MAX_SOURCE_CHARS, sampleChunks } from "@/lib/ai/flashcards";
import { assertAiAllowed } from "@/lib/ai/guard";
import { generateJson } from "@/lib/ai/llm";
import { createDocumentFromText, MIN_SCORE, searchChunks } from "@/lib/ai/rag";
import { ApiError } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import {
  type AdaptDoc,
  type AdaptMode,
  adaptDocSchema,
  fakeAdapt,
  LIMITS,
  MODE_LABEL,
  normalizeDoc,
  outlineSchema,
  summarySchema,
  toMarkdown,
} from "@/lib/study/adhd-format";

const fakeAi = () => process.env.LIFEOS_FAKE_AI === "1";

export const sourceSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("document"), documentId: z.string() }),
  z.object({ kind: z.literal("topic"), topic: z.string().trim().min(2).max(200) }),
  z.object({ kind: z.literal("text"), text: z.string().trim().min(40).max(MAX_SOURCE_CHARS) }),
]);
export const adaptRequestSchema = z.object({
  mode: z.enum(["summary", "outline"]),
  source: sourceSchema,
});
export type AdaptRequest = z.infer<typeof adaptRequestSchema>;

export const adaptSaveSchema = z.object({
  title: z.string().trim().min(1).max(120).optional(),
  subject: z.string().trim().max(100).optional(),
  content: adaptDocSchema,
});

const COMMON = `Eres un tutor que prepara material de estudio de baja carga cognitiva, en español.
- Usa SOLO la información del texto dado. No inventes ni añadas conocimiento externo.
- Frases cortas y directas, voz activa, sin relleno ni muros de texto.
- Destaca con **negrita** solo los conceptos clave (1–2 por bloque). Nada de cursiva ni otro formato.
- No hagas comentarios clínicos ni sobre diagnósticos.`;

const SYSTEM: Record<AdaptMode, string> = {
  summary: `${COMMON}
Formato RESUMEN: "title"; "oneLiner" = la idea central en una frase (máx. ${LIMITS.oneLiner} caracteres);
2–${LIMITS.sections} secciones con "heading" de máx. 6 palabras; cada sección con 1–${LIMITS.blocksPerSection} bloques.
Cada bloque: máximo 2 frases y ${LIMITS.block} caracteres, con las ideas fuerza en **negrita**.
"remember": ${LIMITS.remember} puntos de máx. ${LIMITS.rememberItem} caracteres.`,
  outline: `${COMMON}
Formato ESQUEMA: árbol jerárquico estricto. "root" es el tema; máx. ${LIMITS.branches} ramas, máx. ${LIMITS.children} hijos por nodo y
${LIMITS.depth} niveles bajo la raíz. "label" de máx. 8 palabras (con el término clave en **negrita**);
"detail" opcional de máx. ${LIMITS.detail} caracteres. Sin frases largas en las etiquetas.`,
};

export async function loadSource(userId: string, source: AdaptRequest["source"]): Promise<{ label: string; text: string }> {
  if (source.kind === "text") return { label: "Apuntes pegados", text: source.text };
  if (source.kind === "document") {
    const doc = await prisma.studyDocument.findFirst({
      where: { id: source.documentId, userId },
      include: { chunks: { orderBy: { chunkIndex: "asc" }, select: { content: true } } },
    });
    if (!doc) throw new ApiError(404, "Documento no encontrado");
    if (doc.status !== "EMBEDDED" || !doc.chunks.length) throw new ApiError(409, "El documento aún no está procesado");
    return { label: doc.title, text: sampleChunks(doc.chunks).map((c) => c.content).join("\n\n") };
  }
  const found = (await searchChunks(userId, source.topic, 10)).filter((c) => c.score >= MIN_SCORE);
  if (!found.length) throw new ApiError(422, "No encuentro ese tema en tus apuntes. Prueba con otras palabras o pega el texto.");
  return { label: source.topic, text: found.map((c) => c.content).join("\n\n").slice(0, MAX_SOURCE_CHARS) };
}

/** Genera el resumen o esquema. No escribe nada: guardar es un paso aparte que confirma la atleta. */
export async function adaptStudyContent(userId: string, req: AdaptRequest): Promise<{ content: AdaptDoc; markdown: string; sourceLabel: string; model: string }> {
  const src = await loadSource(userId, req.source);
  let content: AdaptDoc;
  let model = "simulado";
  if (fakeAi()) content = normalizeDoc(fakeAdapt(src.text, req.mode));
  else {
    await assertAiAllowed(userId);
    const prompt = `Tema/origen: ${src.label}\n\nTEXTO:\n${src.text}`;
    if (req.mode === "summary") {
      const r = await generateJson(summarySchema, { userId, system: SYSTEM.summary, prompt, temperature: 0.3 });
      content = normalizeDoc({ mode: "summary", doc: r.data });
      model = r.model;
    } else {
      const r = await generateJson(outlineSchema, { userId, system: SYSTEM.outline, prompt, temperature: 0.3 });
      content = normalizeDoc({ mode: "outline", doc: r.data });
      model = r.model;
    }
  }
  return { content, markdown: toMarkdown(content), sourceLabel: src.label, model };
}

/** Guarda lo confirmado como apunte nuevo. Vuelve a normalizar: el cliente no es de fiar. */
export async function saveAdaptedContent(userId: string, params: z.infer<typeof adaptSaveSchema>) {
  const content = normalizeDoc(params.content);
  const title = params.title || `${MODE_LABEL[content.mode]} · ${content.doc.title}`;
  return createDocumentFromText(userId, { title, subject: params.subject, markdown: toMarkdown(content) });
}
