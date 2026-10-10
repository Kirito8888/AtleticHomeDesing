import "server-only";

import { statfs } from "node:fs/promises";

import { metricsSummary } from "@/lib/admin/metrics";
import { backupAlert } from "@/lib/admin/ops";
import { sendAdminTelegram } from "@/lib/admin/telegram";
import { env } from "@/lib/env";
import { prisma } from "@/lib/prisma";

/**
 * v1.9 · Vigilancia interna (sin servicios externos). Cada 5 minutos comprueba la base de datos,
 * las migraciones, las copias, la cola, el disco y los picos de errores; avisa por Telegram de cada
 * problema nuevo y de cuando se resuelve. Si la web entera cae, avisa scripts/watchdog.sh (cron del servidor).
 */
export type Problem = { key: string; text: string };

const DB_SLOW_MS = 2000;
const ERROR_SPIKE = 10; // errores 5xx en la última hora
const DISK_MIN_FREE = 0.1;
const FAILED_JOBS = 5; // trabajos fallidos en la cola en la última hora

export async function checkHealth(now = new Date()): Promise<Problem[]> {
  const problems: Problem[] = [];
  const t0 = performance.now();
  try {
    await prisma.$queryRaw`select 1`;
    const ms = Math.round(performance.now() - t0);
    if (ms > DB_SLOW_MS) problems.push({ key: "db-slow", text: `La base de datos tarda ${ms} ms en responder.` });
  } catch {
    // Sin base de datos no se puede comprobar nada más
    return [{ key: "db-down", text: "La aplicación no llega a la base de datos." }];
  }
  const failedMig = await prisma.$queryRaw<Array<{ n: bigint }>>`select count(*) as n from "_prisma_migrations" where finished_at is null and rolled_back_at is null`.catch(() => []);
  if (Number(failedMig[0]?.n ?? 0) > 0) problems.push({ key: "migration", text: "Hay una migración de la base de datos sin terminar." });
  const backup = await backupAlert(now).catch(() => null);
  if (backup) problems.push({ key: "backup", text: backup });
  const failedJobs = await prisma.$queryRaw<Array<{ n: bigint }>>`select count(*) as n from pgboss.job where state = 'failed' and completed_on > now() - interval '1 hour'`.catch(() => []);
  const fj = Number(failedJobs[0]?.n ?? 0);
  if (fj >= FAILED_JOBS) problems.push({ key: "queue", text: `${fj} trabajos fallidos en la cola en la última hora (apuntes).` });
  const errors = metricsSummary(now.getTime()).errors;
  if (errors >= ERROR_SPIKE) problems.push({ key: "errors", text: `${errors} errores 500 en la última hora. Mira «Estado del servidor».` });
  const disk = await statfs(env().UPLOAD_DIR).catch(() => null);
  if (disk && disk.blocks > 0 && disk.bavail / disk.blocks < DISK_MIN_FREE) {
    problems.push({ key: "disk", text: `Queda menos del ${DISK_MIN_FREE * 100} % de disco libre (${Math.round((disk.bavail * disk.bsize) / 1e9)} GB).` });
  }
  return problems;
}

const g = globalThis as unknown as { __lifeosWatch?: Map<string, number> };
const REMIND_MS = 6 * 3600_000;

/**
 * Compara con lo avisado antes (en memoria): avisa de lo nuevo, recuerda lo que sigue cada 6 h y
 * dice lo que se ha resuelto. Devuelve los mensajes enviados (o que se habrían enviado sin Telegram).
 */
export async function runWatchJob(now = new Date(), send: (text: string) => Promise<boolean> = sendAdminTelegram): Promise<string[]> {
  const active: Map<string, number> = (g.__lifeosWatch ??= new Map());
  const problems = await checkHealth(now);
  const out: string[] = [];
  for (const p of problems) {
    const last = active.get(p.key);
    if (last == null || now.getTime() - last >= REMIND_MS) {
      out.push(`⚠️ Atlenza: ${p.text}`);
      active.set(p.key, now.getTime());
    }
  }
  for (const key of [...active.keys()]) {
    if (!problems.some((p) => p.key === key)) {
      active.delete(key);
      out.push(`✅ Atlenza: resuelto (${key}).`);
    }
  }
  for (const text of out) await send(text);
  return out;
}

/** Solo para tests. */
export function resetWatch() {
  g.__lifeosWatch?.clear();
}
