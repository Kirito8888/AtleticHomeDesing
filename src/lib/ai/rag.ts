import "server-only";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import type { Content } from "@google/genai";
import { extractText } from "unpdf";

import { Prisma } from "@/generated/prisma/client";
import { chunkDocument } from "@/lib/ai/chunking";
import { embedTexts, generateText, toVectorLiteral } from "@/lib/ai/gemini";
import { assertAiAllowed } from "@/lib/ai/guard";
import { ApiError } from "@/lib/api";
import { env } from "@/lib/env";
import { prisma } from "@/lib/prisma";

export const MAX_UPLOAD_BYTES = 15 * 1024 * 1024;
const ALLOWED: Record<string, string> = {
  "application/pdf": ".pdf",
  "text/plain": ".txt",
  "text/markdown": ".md",
};

function mimeOf(file: File): string | null {
  if (ALLOWED[file.type]) return file.type;
  const ext = path.extname(file.name).toLowerCase();
  if (ext === ".md" || ext === ".markdown") return "text/markdown";
  if (ext === ".txt") return "text/plain";
  if (ext === ".pdf") return "application/pdf";
  return null;
}

/**
 * Valida el contenido real, no solo la extensión: un PDF empieza por "%PDF-"
 * y un TXT/MD debe ser UTF-8 válido sin bytes nulos (descarta binarios renombrados).
 */
export function contentMatches(buf: Buffer, mime: string): boolean {
  if (mime === "application/pdf") return buf.subarray(0, 1024).includes("%PDF-");
  if (buf.includes(0)) return false;
  try {
    new TextDecoder("utf-8", { fatal: true }).decode(buf);
    return true;
  } catch {
    return false;
  }
}

async function assertQuota(userId: string, incoming: number) {
  const { _sum } = await prisma.studyDocument.aggregate({ where: { userId }, _sum: { sizeBytes: true } });
  const quota = env().UPLOAD_QUOTA_MB * 1024 * 1024;
  if ((_sum.sizeBytes ?? 0) + incoming > quota) {
    throw new ApiError(413, `Superarías tu cuota de ${env().UPLOAD_QUOTA_MB} MB de apuntes. Borra documentos antiguos.`);
  }
}

async function extractPages(buf: Buffer, mime: string): Promise<string[]> {
  if (mime === "application/pdf") {
    const { text } = await extractText(new Uint8Array(buf), { mergePages: false });
    return text;
  }
  return [buf.toString("utf8")];
}

/**
 * Ingesta síncrona: guarda el fichero, extrae texto, trocea, vectoriza y
 * persiste. Para apuntes de tamaño normal (< 15 MB) cabe en una petición;
 * si se necesitan libros enteros, mover a una cola (ver manual_backend.md).
 */
export async function ingestDocument(userId: string, file: File, meta: { title?: string; subject?: string }) {
  const mime = mimeOf(file);
  if (!mime) throw new ApiError(415, "Formato no soportado (PDF, TXT o Markdown)");
  if (file.size > MAX_UPLOAD_BYTES) throw new ApiError(413, "El fichero supera 15 MB");
  await assertAiAllowed(userId); // sin clave o sin consentimiento, fallar antes de escribir en disco o en BD

  const buf = Buffer.from(await file.arrayBuffer());
  if (!contentMatches(buf, mime)) throw new ApiError(415, "El contenido del fichero no corresponde a un PDF o texto UTF-8");
  await assertQuota(userId, buf.length);
  const doc = await prisma.studyDocument.create({
    data: {
      userId,
      title: meta.title?.trim() || path.basename(file.name, path.extname(file.name)),
      subject: meta.subject?.trim() || null,
      mimeType: mime,
      storagePath: "",
      sizeBytes: buf.length,
      status: "PROCESSING",
    },
  });

  try {
    const dir = path.resolve(env().UPLOAD_DIR, userId);
    await mkdir(dir, { recursive: true });
    const storagePath = path.join(dir, `${doc.id}${ALLOWED[mime]}`);
    await writeFile(storagePath, buf);

    const chunks = chunkDocument(await extractPages(buf, mime));
    if (!chunks.length) throw new ApiError(422, "No se pudo extraer texto (¿PDF escaneado sin OCR?)");
    const vectors = await embedTexts(
      chunks.map((c) => c.content),
      "RETRIEVAL_DOCUMENT",
    );

    await prisma.$transaction(async (tx) => {
      await tx.documentChunk.createMany({
        data: chunks.map((c) => ({
          documentId: doc.id,
          userId,
          chunkIndex: c.index,
          content: c.content,
          page: c.page,
          tokenCount: Math.ceil(c.content.length / 4),
        })),
      });
      // Prisma no soporta el tipo vector: el embedding se escribe con SQL parametrizado.
      for (let i = 0; i < chunks.length; i++) {
        await tx.$executeRaw`
          UPDATE "DocumentChunk" SET embedding = ${toVectorLiteral(vectors[i])}::vector
          WHERE "documentId" = ${doc.id} AND "chunkIndex" = ${chunks[i].index}`;
      }
    });

    const { GEMINI_EMBEDDING_MODEL, GEMINI_EMBEDDING_DIM } = env();
    return prisma.studyDocument.update({
      where: { id: doc.id },
      data: { status: "EMBEDDED", storagePath, embedModel: `${GEMINI_EMBEDDING_MODEL}@${GEMINI_EMBEDDING_DIM}`, error: null },
      include: { _count: { select: { chunks: true } } },
    });
  } catch (err) {
    await prisma.studyDocument.update({
      where: { id: doc.id },
      data: { status: "FAILED", error: err instanceof Error ? err.message.slice(0, 500) : "Error desconocido" },
    });
    throw err;
  }
}

export interface RetrievedChunk {
  id: string;
  documentId: string;
  title: string;
  page: number | null;
  content: string;
  score: number;
}

/** KNN por distancia coseno con el índice HNSW, filtrado por usuario (y documentos). */
export async function searchChunks(userId: string, query: string, k = 6, documentIds?: string[]): Promise<RetrievedChunk[]> {
  const [vector] = await embedTexts([query], "RETRIEVAL_QUERY");
  const v = toVectorLiteral(vector);
  const docFilter = documentIds?.length ? Prisma.sql`AND c."documentId" IN (${Prisma.join(documentIds)})` : Prisma.empty;
  return prisma.$queryRaw<RetrievedChunk[]>`
    SELECT c.id, c."documentId", d.title, c.page, c.content,
           1 - (c.embedding <=> ${v}::vector) AS score
    FROM "DocumentChunk" c
    JOIN "StudyDocument" d ON d.id = c."documentId"
    WHERE c."userId" = ${userId} AND c.embedding IS NOT NULL ${docFilter}
    ORDER BY c.embedding <=> ${v}::vector
    LIMIT ${k}`;
}

/** Por debajo de esta similitud el fragmento se considera irrelevante. */
const MIN_SCORE = 0.35;

const STUDY_SYSTEM = `Eres Astras, tutor de estudio. Respondes en español.
Reglas:
- Responde SOLO con la información de los fragmentos de apuntes proporcionados.
- Cita las fuentes con [n] usando el número del fragmento.
- Si los fragmentos no contienen la respuesta, dilo claramente y sugiere qué buscar; no inventes.
- Sé didáctico: primero la respuesta directa, después la explicación y, si ayuda, un ejemplo.`;

export async function askStudyQuestion(
  userId: string,
  params: { question: string; threadId?: string; documentIds?: string[] },
) {
  await assertAiAllowed(userId);
  const thread = params.threadId
    ? await prisma.chatThread.findFirst({ where: { id: params.threadId, userId, kind: "STUDY" } })
    : await prisma.chatThread.create({ data: { userId, kind: "STUDY", title: params.question.slice(0, 80) } });
  if (!thread) throw new ApiError(404, "Conversación no encontrada");

  const [history, retrieved] = await Promise.all([
    prisma.chatMessage.findMany({ where: { threadId: thread.id }, orderBy: { createdAt: "desc" }, take: 10 }),
    searchChunks(userId, params.question, 6, params.documentIds),
  ]);
  const sources = retrieved.filter((c) => c.score >= MIN_SCORE);

  const context = sources.length
    ? sources
        .map((s, i) => `[${i + 1}] (${s.title}${s.page ? `, pág. ${s.page}` : ""})\n${s.content}`)
        .join("\n\n---\n\n")
    : "(No hay fragmentos relevantes en los apuntes.)";

  const contents: Content[] = [
    ...history.reverse().map((m) => ({
      role: m.role === "ASSISTANT" ? "model" : "user",
      parts: [{ text: m.content }],
    })),
    { role: "user", parts: [{ text: `Fragmentos de apuntes:\n\n${context}\n\nPregunta: ${params.question}` }] },
  ];

  const answer = await generateText({ system: STUDY_SYSTEM, contents });
  const citations = sources.map((s, i) => ({
    n: i + 1,
    chunkId: s.id,
    documentId: s.documentId,
    title: s.title,
    page: s.page,
    score: Math.round(Number(s.score) * 1000) / 1000,
  }));

  const [, assistant] = await prisma.$transaction([
    prisma.chatMessage.create({ data: { threadId: thread.id, role: "USER", content: params.question } }),
    prisma.chatMessage.create({
      data: {
        threadId: thread.id,
        role: "ASSISTANT",
        content: answer.text,
        citations,
        model: answer.model,
        inputTokens: answer.inputTokens,
        outputTokens: answer.outputTokens,
      },
    }),
    prisma.chatThread.update({ where: { id: thread.id }, data: { updatedAt: new Date() } }),
  ]);
  return { threadId: thread.id, message: assistant };
}
