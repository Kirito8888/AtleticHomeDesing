import "server-only";
import { PgBoss } from "pg-boss";

import { processDocument, type ProcessDeps } from "@/lib/ai/rag";

// Cola de trabajos en segundo plano sobre el mismo PostgreSQL (pg-boss crea su
// propio esquema "pgboss"): sin Redis ni contenedores nuevos. Hoy procesa la
// ingesta de apuntes; reintenta 2 veces con espera creciente si algo falla.

export const INGEST_QUEUE = "ingest-document";

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
  boss.on("error", (err) => console.error("[jobs]", err));
  await boss.start();
  return boss;
}

async function ensureQueue(boss: PgBoss, name: string) {
  if (created.has(name)) return;
  await boss.createQueue(name, queueOptions);
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

/** Arranca el trabajador (una ingesta a la vez para no saturar la cuota de Gemini). */
export async function startIngestWorker(deps?: ProcessDeps, queue = INGEST_QUEUE): Promise<void> {
  const boss = await getBoss();
  await ensureQueue(boss, queue);
  await boss.work<{ documentId: string }>(queue, { batchSize: 1 }, async ([job]) => {
    await processDocument(job.data.documentId, deps);
  });
  console.info("[jobs] trabajador de ingesta de apuntes activo");
}

export async function stopBoss(): Promise<void> {
  const boss = await g.__lifeosBoss;
  g.__lifeosBoss = undefined;
  created.clear();
  await boss?.stop({ graceful: true, timeout: 30_000 });
}
