import "server-only";

import { statfs } from "node:fs/promises";

import pkg from "../../../package.json";
import { env } from "@/lib/env";
import { prisma } from "@/lib/prisma";
import { schedulerStatus } from "@/lib/scheduler";
import { recentServerErrors } from "@/lib/admin/server-errors";
import { updateInfo } from "@/lib/admin/ops";

const safe = async <T>(fn: () => Promise<T>): Promise<T | null> => {
  try {
    return await fn();
  } catch {
    return null;
  }
};

/**
 * Estado del servidor para el admin: versión, BD, migraciones, cola, planificador,
 * espacio de subidas y última copia. Nunca lanza: lo que no se pueda leer sale como null.
 */
export async function serverStatus() {
  const t0 = performance.now();
  const dbOk = await safe(() => prisma.$queryRaw`select 1`);
  const dbMs = Math.round(performance.now() - t0);
  const [size, vector, migrations, queue, backup, disk] = await Promise.all([
    safe(async () => Number((await prisma.$queryRaw<Array<{ b: bigint }>>`select pg_database_size(current_database()) as b`)[0].b)),
    safe(async () => (await prisma.$queryRaw<Array<{ v: string }>>`select extversion as v from pg_extension where extname = 'vector'`)[0]?.v ?? null),
    safe(async () => {
      const rows = await prisma.$queryRaw<Array<{ name: string; finished: Date | null; rolled: Date | null }>>`
        select migration_name as name, finished_at as finished, rolled_back_at as rolled from "_prisma_migrations" order by started_at`;
      const applied = rows.filter((r) => r.finished && !r.rolled);
      return {
        applied: applied.length,
        last: applied.at(-1) ? { name: applied.at(-1)!.name, at: applied.at(-1)!.finished!.toISOString() } : null,
        failed: rows.filter((r) => !r.finished && !r.rolled).map((r) => r.name),
      };
    }),
    safe(async () => {
      const rows = await prisma.$queryRaw<Array<{ state: string; n: bigint }>>`select state::text as state, count(*) as n from pgboss.job group by state`;
      return Object.fromEntries(rows.map((r) => [r.state, Number(r.n)])) as Record<string, number>;
    }),
    safe(() => prisma.backupRun.findFirst({ orderBy: { at: "desc" }, select: { at: true, ok: true, detail: true } })),
    safe(async () => {
      const s = await statfs(env().UPLOAD_DIR);
      return { freeBytes: s.bavail * s.bsize, totalBytes: s.blocks * s.bsize };
    }),
  ]);
  const lastOk = await safe(() => prisma.backupRun.findFirst({ where: { ok: true }, orderBy: { at: "desc" }, select: { at: true } }));
  const [errors, update] = await Promise.all([safe(() => recentServerErrors(10)), safe(() => updateInfo())]);
  return {
    version: pkg.version,
    node: process.version,
    uptimeSec: Math.round(process.uptime()),
    db: { ok: dbOk != null, latencyMs: dbOk != null ? dbMs : null, sizeBytes: size, pgvector: vector },
    migrations,
    queue,
    scheduler: schedulerStatus(),
    uploads: disk,
    backup: backup ? { at: backup.at.toISOString(), ok: backup.ok, detail: backup.detail, lastOkAt: lastOk?.at.toISOString() ?? null } : null,
    // v1.8
    commit: process.env.GIT_SHA || null,
    update,
    errors: (errors ?? []).map((e) => ({ kind: e.kind, path: e.path, message: e.message, count: e.count, lastAt: e.lastAt.toISOString() })),
  };
}
export type ServerStatus = Awaited<ReturnType<typeof serverStatus>>;
