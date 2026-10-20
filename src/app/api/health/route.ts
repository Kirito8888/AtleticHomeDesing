import { cookies } from "next/headers";

import { healthStatus, QUEUE_STUCK_MIN, type QueueCounts } from "@/lib/admin/health";
import { prisma } from "@/lib/prisma";

const HEADERS = { "cache-control": "no-store" };

/** Cola de pg-boss: trabajos parados más de QUEUE_STUCK_MIN min y fallidos en 24 h. Sin esquema `pgboss` (aún sin usar) = vacía. */
async function queueCounts(): Promise<QueueCounts | null> {
  try {
    const exists = await prisma.$queryRaw<Array<{ ok: boolean }>>`select to_regclass('pgboss.job') is not null as ok`;
    if (!exists[0]?.ok) return { stuck: 0, failed24h: 0 };
    const r = await prisma.$queryRaw<Array<{ stuck: bigint; failed: bigint }>>`
      select count(*) filter (where state in ('created','retry') and created_on < now() - make_interval(mins => ${QUEUE_STUCK_MIN})) as stuck,
             count(*) filter (where state = 'failed' and completed_on > now() - interval '24 hours') as failed
      from pgboss.job`;
    return { stuck: Number(r[0]?.stuck ?? 0), failed24h: Number(r[0]?.failed ?? 0) };
  } catch {
    return null;
  }
}

/**
 * Healthcheck de Docker, de scripts/update.sh y del vigilante. Sin sesión solo dice «ok» o «degradado»
 * (o «caído» con 503 si no hay BD). «Degradado» responde 200: un atasco de la cola no debe tumbar el despliegue.
 * Con sesión añade el detalle de las comprobaciones, sin datos personales.
 */
export async function GET() {
  let db = false;
  try {
    await prisma.$queryRaw`SELECT 1`;
    db = true;
  } catch {
    // sin BD
  }
  const h = healthStatus(db, db ? await queueCounts() : null);
  if (h.status === "caído") return Response.json({ status: h.status }, { status: 503, headers: HEADERS });
  let detail: Record<string, string | boolean> | undefined;
  const jar = await cookies();
  if (jar.getAll().some((c) => c.name.includes("authjs.session-token"))) {
    const { auth } = await import("@/auth");
    if ((await auth().catch(() => null))?.user) detail = { db: h.db, queue: h.queue };
  }
  return Response.json({ status: h.status, ...(detail ? { checks: detail } : {}) }, { headers: HEADERS });
}
