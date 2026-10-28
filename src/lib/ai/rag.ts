import "server-only";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { extractText } from "unpdf";

import { Prisma } from "@/generated/prisma/client";
import { chunkDocument } from "@/lib/ai/chunking";
import { DOC_ERROR } from "@/lib/ai/doc-error";
import { ocrAvailable, ocrPdf } from "@/lib/files/ocr";
import { embedTexts, generateText, toVectorLiteral } from "@/lib/ai/llm";
import type { EmbedTask } from "@/lib/ai/provider";
import { assertAiAllowed } from "@/lib/ai/guard";
import { supportsIterativeScan } from "@/lib/ai/pgvector-version";
import { ApiError } from "@/lib/api";
import { env } from "@/lib/env";
import { prisma } from "@/lib/prisma";
import { log } from "@/lib/log";
import { formatBytes } from "@/lib/format";
import { checkQuota, quotaLimit } from "@/lib/study/quota";

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

/** Bytes de apuntes de la atleta. En SQL con bigint: la suma de varios `Int` puede pasar de 2³¹. */
export async function studyStorageUsage(userId: string): Promise<{ used: number; limit: number }> {
  const [row] = await prisma.$queryRaw<{ used: bigint }[]>`
    SELECT COALESCE(SUM("sizeBytes"), 0)::bigint AS used FROM "StudyDocument" WHERE "userId" = ${userId}`;
  return { used: Number(row?.used ?? 0), limit: quotaLimit(env().UPLOAD_QUOTA_MB) };
}

async function assertQuota(userId: string, incoming: number) {
  const { used, limit } = await studyStorageUsage(userId);
  if (!checkQuota(used, incoming, limit).ok) {
    throw new ApiError(413, `Superarías tu límite de ${formatBytes(limit)} de apuntes (usas ${formatBytes(used)}). Borra apuntes antiguos.`);
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
 *
 * @param meta.title Título; por defecto, el nombre del fichero sin extensión.
 * @returns El `StudyDocument` en PENDING con su `storagePath`.
 * @throws {ApiError} 415 formato o contenido no válido · 413 más de 15 MB o cuota superada ·
 *   (de `assertAiAllowed`) sin IA configurada o sin consentimiento. Si falla al escribir el fichero, borra el registro.
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

/**
 * v2.5 · Guarda un resumen/esquema que la atleta ha confirmado como apunte NUEVO (.md). Ya viene en texto,
 * así que se trocea y queda listo para buscar por texto sin llamar a la IA (si cambia de IA se reindexa).
 * Nunca toca el apunte de origen ni sus flashcards.
 *
 * @param meta.markdown Contenido ya en texto; se trocea con `chunkDocument`.
 * @returns El documento en EMBEDDED (`embedModel` = `TEXT_ONLY`) con el recuento de fragmentos.
 * @throws {ApiError} 413 cuota superada · 422 si no queda contenido tras trocear.
 */
export async function createDocumentFromText(userId: string, meta: { title: string; subject?: string | null; markdown: string }) {
  const buf = Buffer.from(meta.markdown, "utf8");
  await assertQuota(userId, buf.length);
  const chunks = chunkDocument([meta.markdown]);
  if (!chunks.length) throw new ApiError(422, "No hay contenido que guardar");
  const doc = await prisma.studyDocument.create({
    data: { userId, title: meta.title.slice(0, 200), subject: meta.subject?.trim() || null, mimeType: "text/markdown", storagePath: "", sizeBytes: buf.length, status: "PROCESSING" },
  });
  try {
    const dir = path.resolve(/* turbopackIgnore: true */ env().UPLOAD_DIR, userId);
    await mkdir(dir, { recursive: true });
    const storagePath = path.join(/* turbopackIgnore: true */ dir, `${doc.id}.md`);
    await writeFile(storagePath, buf);
    await prisma.$transaction([
      prisma.documentChunk.createMany({
        data: chunks.map((c) => ({ documentId: doc.id, userId, chunkIndex: c.index, content: c.content, page: c.page, tokenCount: Math.ceil(c.content.length / 4) })),
      }),
      prisma.studyDocument.update({ where: { id: doc.id }, data: { storagePath, status: "EMBEDDED", embedModel: TEXT_ONLY, error: null } }),
    ]);
    return prisma.studyDocument.findUniqueOrThrow({ where: { id: doc.id }, include: { _count: { select: { chunks: true } } } });
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
 *
 * @param documentId Documento a procesar.
 * @param deps Embeddings y comprobación de IA (inyectables en tests).
 * @returns El documento en EMBEDDED; si no existe o ya estaba procesado, lo devuelve sin hacer nada (`null` si no existe).
 * @throws {ApiError} 422 sin texto extraíble · 502 embeddings incompletos; también errores de IA o de disco.
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
      // Por lotes: una sentencia con `unnest` en vez de un UPDATE por chunk.
      const BATCH = 500;
      for (let i = 0; embedded && i < chunks.length; i += BATCH) {
        const part = chunks.slice(i, i + BATCH);
        await tx.$executeRaw`
          UPDATE "DocumentChunk" AS c SET embedding = v.vec::vector
          FROM unnest(${part.map((c) => c.index)}::int[], ${part.map((_, j) => toVectorLiteral(embedded.vectors[i + j]))}::text[]) AS v(idx, vec)
          WHERE c."documentId" = ${doc.id} AND c."chunkIndex" = v.idx`;
      }
    }, { timeout: 120_000 });

    return prisma.studyDocument.update({
      where: { id: doc.id },
      data: { status: "EMBEDDED", embedModel: embedded?.tag ?? TEXT_ONLY, error: null },
      include: { _count: { select: { chunks: true } } },
    });
  } catch (err) {
    log.warn("ingesta de documento fallida", { job: "ingest", err });
    await prisma.studyDocument
      .update({ where: { id: doc.id }, data: { status: "FAILED", error: DOC_ERROR } })
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

let iterativeScan: Promise<boolean> | undefined;
/** pgvector ≥ 0.8: el filtro por usuaria/modelo se aplica tras el HNSW; el escaneo iterativo sigue hasta reunir *k*. */
function hasIterativeScan(): Promise<boolean> {
  iterativeScan ??= prisma
    .$queryRaw<Array<{ extversion: string }>>`SELECT extversion FROM pg_extension WHERE extname = 'vector'`
    .then((r) => supportsIterativeScan(r[0]?.extversion))
    .catch(() => false);
  return iterativeScan;
}

async function vectorSearch(query: Prisma.Sql): Promise<RetrievedChunk[]> {
  if (!(await hasIterativeScan())) return prisma.$queryRaw<RetrievedChunk[]>(query);
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT set_config('hnsw.iterative_scan', 'strict_order', true)`;
    return tx.$queryRaw<RetrievedChunk[]>(query);
  });
}

/**
 * Fragmentos más relevantes. Los documentos vectorizados con el modelo actual del usuario se buscan
 * por similitud (KNN coseno con el índice HNSW); el resto (IA sin embeddings, o vectorizados con otro
 * modelo hasta que se reindexen) por texto completo en español. Siempre filtrado por usuario.
 *
 * @param userId Dueña de los apuntes: ningún fragmento de otra usuaria puede salir.
 * @param query Pregunta o tema.
 * @param k Máximo de fragmentos (6 por defecto).
 * @param documentIds Restringe a estos documentos (vacío = todos).
 * @returns Hasta `k` fragmentos por `score` descendente (similitud coseno, o rango de texto escalado desde 0,35).
 *   Filtrar con `MIN_SCORE`. Sin embeddings en la IA de la usuaria solo hay búsqueda por texto.
 */
export async function searchChunks(userId: string, query: string, k = 6, documentIds?: string[], deps: Pick<ProcessDeps, "embed"> = defaultDeps): Promise<RetrievedChunk[]> {
  const docFilter = documentIds?.length ? Prisma.sql`AND c."documentId" IN (${Prisma.join(documentIds)})` : Prisma.empty;
  const q = await deps.embed(userId, [query], "RETRIEVAL_QUERY");
  const byVector = q
    ? await vectorSearch(
        Prisma.sql`SELECT c.id, c."documentId", d.title, c.page, c.content,
               1 - (c.embedding <=> ${toVectorLiteral(q.vectors[0])}::vector) AS score
        FROM "DocumentChunk" c
        JOIN "StudyDocument" d ON d.id = c."documentId"
        WHERE c."userId" = ${userId} AND c.embedding IS NOT NULL AND d."embedModel" = ${q.tag} ${docFilter}
        ORDER BY c.embedding <=> ${toVectorLiteral(q.vectors[0])}::vector
        LIMIT ${k}`,
      )
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
export const MIN_SCORE = 0.35;

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

/**
 * Responde una pregunta de estudio con RAG sobre los apuntes de la usuaria y guarda el intercambio en el hilo.
 * Solo usa fragmentos con `score` ≥ `MIN_SCORE`; la respuesta cita con [n].
 *
 * @param params.threadId Hilo STUDY existente; si falta, se crea uno titulado con la pregunta.
 * @param params.documentIds Limita la búsqueda a estos apuntes.
 * @returns `{ threadId, message }` (mensaje del asistente con `citations`, modelo y tokens).
 * @throws {ApiError} 404 si el hilo no existe o no es suyo; errores de `assertAiAllowed` y del proveedor de IA.
 */
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
