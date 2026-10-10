import "server-only";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { extractText } from "unpdf";

import { Prisma } from "@/generated/prisma/client";
import { chunkDocument } from "@/lib/ai/chunking";
import { ocrAvailable, ocrPdf } from "@/lib/files/ocr";
import { embedTexts, generateText, toVectorLiteral } from "@/lib/ai/llm";
import type { EmbedTask } from "@/lib/ai/provider";
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
    // v1.10 · PDF escaneado (sin capa de texto): OCR en el servidor si está disponible
    if (text.every((p) => !p.trim()) && (await ocrAvailable())) return ocrPdf(buf);
    return text;
  }
  return [buf.toString("utf8")];
}

/**
 * Paso 1 (en la petición): valida, guarda el fichero y crea el documento en
 * PENDING. El trabajo pesado (extraer, trocear, vectorizar) lo hace
 * processDocument() en segundo plano (src/lib/jobs/queue.ts), así que libros
 * enteros no agotan el tiempo de la petición.
 */
export async function createDocumentFromUpload(userId: string, file: File, meta: { title?: string; subject?: string }) {
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
      status: "PENDING",
    },
  });
  try {
    // turbopackIgnore: ruta de datos en ejecución, no un fichero del proyecto (si no, el trazado
    // del build mete todo el proyecto en la imagen)
    const dir = path.resolve(/* turbopackIgnore: true */ env().UPLOAD_DIR, userId);
    await mkdir(dir, { recursive: true });
    const storagePath = path.join(/* turbopackIgnore: true */ dir, `${doc.id}${ALLOWED[mime]}`);
    await writeFile(storagePath, buf);
    return prisma.studyDocument.update({ where: { id: doc.id }, data: { storagePath } });
  } catch (err) {
    await prisma.studyDocument.delete({ where: { id: doc.id } }).catch(() => {});
    throw err;
  }
}

export interface ProcessDeps {
  /** Vectores y etiqueta del modelo con la IA del usuario; null si su IA no tiene embeddings (búsqueda por texto). */
  embed: (userId: string, texts: string[], task: EmbedTask) => Promise<{ vectors: number[][]; tag: string } | null>;
  /** Comprueba IA disponible y consentimiento justo antes de enviar nada. */
  assertAllowed: (userId: string) => Promise<void>;
}

const defaultDeps: ProcessDeps = { embed: embedTexts, assertAllowed: assertAiAllowed };

/** Valor de embedModel de los documentos indexados solo para búsqueda por texto. */
export const TEXT_ONLY = "texto";

/**
 * Paso 2 (en segundo plano): extrae texto, trocea, vectoriza y guarda. Idempotente:
 * borra los fragmentos previos, así que un reintento no duplica nada.
 * Si falla deja el documento en FAILED con el motivo y relanza el error (pg-boss reintenta).
 */
export async function processDocument(documentId: string, deps: ProcessDeps = defaultDeps) {
  const doc = await prisma.studyDocument.findUnique({ where: { id: documentId } });
  if (!doc || doc.status === "EMBEDDED") return doc; // borrado entretanto o ya procesado
  await prisma.studyDocument.update({ where: { id: doc.id }, data: { status: "PROCESSING", error: null } });
  try {
    // El consentimiento pudo retirarse entre la subida y el proceso.
    await deps.assertAllowed(doc.userId);
    const buf = await readFile(doc.storagePath);
    const chunks = chunkDocument(await extractPages(buf, doc.mimeType));
    if (!chunks.length) throw new ApiError(422, "No se pudo extraer texto (¿PDF escaneado? El OCR del servidor no encontró texto o no está instalado)");
    const embedded = await deps.embed(doc.userId, chunks.map((c) => c.content), "RETRIEVAL_DOCUMENT");
    if (embedded && embedded.vectors.length !== chunks.length) throw new ApiError(502, "Respuesta de embeddings incompleta");

    await prisma.$transaction(async (tx) => {
      await tx.documentChunk.deleteMany({ where: { documentId: doc.id } });
      await tx.documentChunk.createMany({
        data: chunks.map((c) => ({
          documentId: doc.id,
          userId: doc.userId,
          chunkIndex: c.index,
          content: c.content,
          page: c.page,
          tokenCount: Math.ceil(c.content.length / 4),
        })),
      });
      // Prisma no soporta el tipo vector: el embedding se escribe con SQL parametrizado.
      for (let i = 0; embedded && i < chunks.length; i++) {
        await tx.$executeRaw`
          UPDATE "DocumentChunk" SET embedding = ${toVectorLiteral(embedded.vectors[i])}::vector
          WHERE "documentId" = ${doc.id} AND "chunkIndex" = ${chunks[i].index}`;
      }
    }, { timeout: 120_000 });

    return prisma.studyDocument.update({
      where: { id: doc.id },
      data: { status: "EMBEDDED", embedModel: embedded?.tag ?? TEXT_ONLY, error: null },
      include: { _count: { select: { chunks: true } } },
    });
  } catch (err) {
    await prisma.studyDocument
      .update({ where: { id: doc.id }, data: { status: "FAILED", error: err instanceof Error ? err.message.slice(0, 500) : "Error desconocido" } })
      .catch(() => {}); // el documento pudo borrarse mientras tanto
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

/**
 * Fragmentos más relevantes. Los documentos vectorizados con el modelo actual del usuario se buscan
 * por similitud (KNN coseno con el índice HNSW); el resto (IA sin embeddings, o vectorizados con otro
 * modelo hasta que se reindexen) por texto completo en español. Siempre filtrado por usuario.
 */
export async function searchChunks(userId: string, query: string, k = 6, documentIds?: string[], deps: Pick<ProcessDeps, "embed"> = defaultDeps): Promise<RetrievedChunk[]> {
  const docFilter = documentIds?.length ? Prisma.sql`AND c."documentId" IN (${Prisma.join(documentIds)})` : Prisma.empty;
  const q = await deps.embed(userId, [query], "RETRIEVAL_QUERY");
  const byVector = q
    ? await prisma.$queryRaw<RetrievedChunk[]>`
        SELECT c.id, c."documentId", d.title, c.page, c.content,
               1 - (c.embedding <=> ${toVectorLiteral(q.vectors[0])}::vector) AS score
        FROM "DocumentChunk" c
        JOIN "StudyDocument" d ON d.id = c."documentId"
        WHERE c."userId" = ${userId} AND c.embedding IS NOT NULL AND d."embedModel" = ${q.tag} ${docFilter}
        ORDER BY c.embedding <=> ${toVectorLiteral(q.vectors[0])}::vector
        LIMIT ${k}`
    : [];
  const sameModel = q ? Prisma.sql`AND d."embedModel" IS DISTINCT FROM ${q.tag}` : Prisma.empty;
  // ts_rank normalizado (32: rank / (rank + 1)) y escalado para compararlo con la similitud coseno
  const byText = await prisma.$queryRaw<RetrievedChunk[]>`
    SELECT c.id, c."documentId", d.title, c.page, c.content,
           LEAST(1, 0.35 + ts_rank(to_tsvector('spanish', c.content), websearch_to_tsquery('spanish', ${query}), 32) * 2) AS score
    FROM "DocumentChunk" c
    JOIN "StudyDocument" d ON d.id = c."documentId"
    WHERE c."userId" = ${userId} AND d.status = 'EMBEDDED' ${sameModel} ${docFilter}
      AND to_tsvector('spanish', c.content) @@ websearch_to_tsquery('spanish', ${query})
    ORDER BY score DESC
    LIMIT ${k}`;
  return [...byVector, ...byText].sort((a, b) => Number(b.score) - Number(a.score)).slice(0, k);
}

/** Por debajo de esta similitud el fragmento se considera irrelevante. */
const MIN_SCORE = 0.35;

/**
 * Documentos indexados con otro modelo (o solo por texto) cuando el usuario cambia de IA: se vuelven
 * a procesar en segundo plano. Devuelve los ids para encolarlos.
 */
export async function documentsToReindex(userId: string, tag: string | null): Promise<string[]> {
  const docs = await prisma.studyDocument.findMany({
    where: { userId, status: { in: ["EMBEDDED", "FAILED"] }, NOT: { embedModel: tag ?? TEXT_ONLY } },
    select: { id: true },
  });
  if (!docs.length) return [];
  await prisma.studyDocument.updateMany({ where: { id: { in: docs.map((d) => d.id) } }, data: { status: "PENDING", error: null } });
  return docs.map((d) => d.id);
}

const STUDY_SYSTEM = `Eres el tutor de estudio de Atlenza. Respondes en español.
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

  const messages = [
    ...history.reverse().map((m) => ({ role: m.role === "ASSISTANT" ? ("assistant" as const) : ("user" as const), text: m.content })),
    { role: "user" as const, text: `Fragmentos de apuntes:\n\n${context}\n\nPregunta: ${params.question}` },
  ];

  const answer = await generateText({ userId, system: STUDY_SYSTEM, messages });
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
