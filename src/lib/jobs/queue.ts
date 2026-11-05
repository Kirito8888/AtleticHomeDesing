import "server-only";
import { PgBoss } from "pg-boss";

import { processDocument, type ProcessDeps } from "@/lib/ai/rag";
import { log } from "@/lib/log";

// Cola de trabajos en segundo plano sobre el mismo PostgreSQL (pg-boss crea su
// propio esquema "pgboss"): sin Redis ni contenedores nuevos. Hoy procesa la
// ingesta de apuntes; reintenta 2 veces con espera creciente si algo falla.

export const INGEST_QUEUE = "ingest-document";
/** v2.6 · Generación del paquete de estudio de un tema (varias llamadas a la IA, una tras otra). */
export const PACK_QUEUE = "study-pack";

const g = globalThis as unknown as { __lifeosBoss?: Promise<PgBoss> };

function connectionString(): string {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL no está definida");
  // "?schema=public" es de Prisma; node-postgres no lo entiende.
  const u = new URL(url);
  u.searchParams.delete("schema");
  return u.toString();
}

const queueOptions = {
  retryLimit: 2,
  retryDelay: 30,
  retryBackoff: true,
  expireInSeconds: 15 * 60, // un libro grande con muchas llamadas a Gemini
  deleteAfterSeconds: 7 * 24 * 3600,
};
const created = new Set<string>();

async function create(): Promise<PgBoss> {
  const boss = new PgBoss({ connectionString: connectionString(), schema: "pgboss" });
  boss.on("error", (err) => log.error("cola de trabajos", { job: "pgboss", err }));
  await boss.start();
  return boss;
}

async function ensureQueue(boss: PgBoss, name: string, options: Partial<typeof queueOptions> = {}) {
  if (created.has(name)) return;
  await boss.createQueue(name, { ...queueOptions, ...options });
  created.add(name);
}

export function getBoss(): Promise<PgBoss> {
  g.__lifeosBoss ??= create().catch((err) => {
    g.__lifeosBoss = undefined; // permitir reintentar en la siguiente petición
    throw err;
  });
  return g.__lifeosBoss;
}

/**
 * Encola la ingesta de un documento. singletonKey evita duplicarla si se pulsa dos veces.
 * `queue` solo cambia en los tests (cola propia, aislada de un servidor en marcha).
 */
export async function enqueueIngest(documentId: string, queue = INGEST_QUEUE): Promise<void> {
  const boss = await getBoss();
  await ensureQueue(boss, queue);
  await boss.send(queue, { documentId }, { singletonKey: documentId });
}

/**
 * L2 · Caducidad de un trabajo del paquete. Peor caso con la IA local (~35 tok/s, de una en una): 7 llamadas (resumen + 6 partes)
 * × 3 intentos (`MAX_VALIDATION_RETRIES` + 1) × 300 s (`LOCAL_AI_TIMEOUT_MS` por defecto) = 105 min. Se fija por trabajo en `send`
 * porque `createQueue` no cambia una cola que ya existe en la BD.
 */
export const PACK_EXPIRE_SECONDS = 2 * 60 * 60;

// Sin reintentos automáticos (volver a lanzarlo solo rehace lo que falló y lo decide la usuaria).
const packOptions = { retryLimit: 0, expireInSeconds: PACK_EXPIRE_SECONDS };

/** Encola la generación del paquete de un tema. `singletonKey` evita duplicarla si se pulsa dos veces. */
export async function enqueuePack(job: { userId: string; topicId: string; documentIds?: string[] }, queue = PACK_QUEUE): Promise<void> {
  const boss = await getBoss();
  await ensureQueue(boss, queue, packOptions);
  await boss.send(queue, job, { singletonKey: job.topicId, expireInSeconds: PACK_EXPIRE_SECONDS });
}

/** Trabajador del paquete de estudio: uno a la vez (la cuota de la IA es de la usuaria). */
export async function startPackWorker(queue = PACK_QUEUE): Promise<void> {
  const boss = await getBoss();
  await ensureQueue(boss, queue, packOptions);
  const { runPack } = await import("@/lib/ai/study-pack");
  await boss.work<{ userId: string; topicId: string; documentIds?: string[] }>(queue, { batchSize: 1 }, async ([job]) => {
    await runPack(job.data.userId, job.data.topicId, { documentIds: job.data.documentIds });
  });
  log.info("trabajador del paquete de estudio activo", { job: "study-pack" });
}

/** Arranca el trabajador (una ingesta a la vez para no saturar la cuota de Gemini). */
export async function startIngestWorker(deps?: ProcessDeps, queue = INGEST_QUEUE): Promise<void> {
  const boss = await getBoss();
  await ensureQueue(boss, queue);
  await boss.work<{ documentId: string }>(queue, { batchSize: 1 }, async ([job]) => {
    await processDocument(job.data.documentId, deps);
  });
  log.info("trabajador de ingesta de apuntes activo", { job: "ingest" });
}

export async function stopBoss(): Promise<void> {
  const boss = await g.__lifeosBoss;
  g.__lifeosBoss = undefined;
  created.clear();
  await boss?.stop({ graceful: true, timeout: 30_000 });
}
