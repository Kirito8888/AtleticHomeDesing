import "server-only";

import { readdir, stat } from "node:fs/promises";
import path from "node:path";

import { env } from "@/lib/env";
import { prisma } from "@/lib/prisma";

/**
 * v1.8 · Revisión de integridad (solo lectura: informa, no arregla):
 *  - ficheros cifrados sin su fila y filas cuyo fichero falta (fotos y justificantes);
 *  - sesiones completadas con duración y RPE pero sin TSS;
 *  - usuarios cuya carga diaria (PMC) va por detrás de su última sesión.
 */
export async function checkIntegrity() {
  const base = path.resolve(/* turbopackIgnore: true */ env().UPLOAD_DIR);
  const [photos, receipts] = await Promise.all([prisma.injuryPhoto.findMany({ select: { userId: true, path: true } }), prisma.receipt.findMany({ select: { userId: true, path: true } })]);
  const known = new Set([...photos, ...receipts].map((f) => `${f.userId}/${f.path}`));
  const onDisk = new Set<string>();
  for (const user of await readdir(base).catch(() => [] as string[])) {
    for (const sub of ["photos", "receipts"]) {
      for (const f of await readdir(path.join(/* turbopackIgnore: true */ base, user, sub)).catch(() => [] as string[])) onDisk.add(`${user}/${sub}/${f}`);
    }
  }
  const orphanFiles = [...onDisk].filter((f) => !known.has(f)).length;
  let missingFiles = 0;
  for (const k of known) if (!onDisk.has(k)) missingFiles += (await stat(path.join(/* turbopackIgnore: true */ base, k)).catch(() => null)) ? 0 : 1;
  const [sessionsNoTss, stale] = await Promise.all([
    prisma.trainingSession.count({ where: { status: "COMPLETED", tss: null, durationSec: { not: null }, sessionRpe: { not: null } } }),
    prisma.$queryRaw<Array<{ n: bigint }>>`
      select count(*) as n from (
        select s."userId", max(s.date) as last_session, (select max(d.date) from "DailyLoad" d where d."userId" = s."userId") as last_load
        from "TrainingSession" s where s.status = 'COMPLETED' group by s."userId"
      ) t where t.last_load is null or t.last_load < t.last_session`,
  ]);
  const staleLoads = Number(stale[0]?.n ?? 0);
  return { checkedAt: new Date().toISOString(), orphanFiles, missingFiles, sessionsNoTss, staleLoads, ok: orphanFiles + missingFiles + sessionsNoTss + staleLoads === 0 };
}

/** Horas sin copia buena a partir de las cuales se avisa (la misma cifra para Telegram, «Estado» y update.sh). */
export const BACKUP_MAX_AGE_H = 36;
type Run = { ok: boolean; at: Date; detail?: string | null };

/** Estado de las copias (puro): `none` = nunca se registró una, es decir, el servicio no está en uso o no corre. */
export function backupState(last: Run | null, lastOk: Run | null, now = new Date()): { ok: boolean; none: boolean; message: string | null } {
  if (!last) return { ok: false, none: true, message: "No consta ninguna copia de seguridad: el servicio de copias no está activo (o aún no ha corrido)." };
  if (!last.ok) return { ok: false, none: false, message: `La última copia de seguridad falló (${last.detail ?? "sin detalle"}).` };
  if (!lastOk || now.getTime() - lastOk.at.getTime() > BACKUP_MAX_AGE_H * 3600_000) {
    return { ok: false, none: false, message: `No hay copia de seguridad buena desde hace más de ${BACKUP_MAX_AGE_H} horas: revisa el servicio de copias.` };
  }
  return { ok: true, none: false, message: null };
}

/** Copias: ¿hay un aviso que dar por Telegram? Sin ninguna copia registrada calla (no se vigila lo que no se usa). */
export async function backupAlert(now = new Date()): Promise<string | null> {
  const [last, lastOk] = await Promise.all([prisma.backupRun.findFirst({ orderBy: { at: "desc" } }), prisma.backupRun.findFirst({ where: { ok: true }, orderBy: { at: "desc" } })]);
  const st = backupState(last, lastOk, now);
  return st.none ? null : st.message;
}

// Versión nueva: último commit de main en GitHub (repositorio público; sin credenciales), con caché de 6 h
const cache: { at: number; value: { sha: string; date: string; message: string } | null } = { at: 0, value: null };
export async function latestRelease(fetcher: typeof fetch = fetch) {
  const repo = process.env.UPDATE_REPO ?? "Kirito8888/AtleticHomeDesing";
  if (Date.now() - cache.at < 6 * 3600_000) return cache.value;
  try {
    const r = await fetcher(`https://api.github.com/repos/${repo}/commits/main`, { headers: { accept: "application/vnd.github+json", "user-agent": "lifeos-status" }, signal: AbortSignal.timeout(4000) });
    if (!r.ok) throw new Error(String(r.status));
    const j = (await r.json()) as { sha: string; commit: { message: string; committer: { date: string } } };
    cache.value = { sha: j.sha, date: j.commit.committer.date, message: j.commit.message.split("\n")[0].slice(0, 120) };
  } catch {
    cache.value = null;
  }
  cache.at = Date.now();
  return cache.value;
}

export async function updateInfo() {
  const current = process.env.GIT_SHA || null;
  const latest = await latestRelease();
  return { current, latest, newer: Boolean(current && latest && !latest.sha.startsWith(current) && !current.startsWith(latest.sha)) };
}
