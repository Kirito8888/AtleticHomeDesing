/**
 * v1.9 · Métricas internas de la API: peticiones, errores 5xx y latencias por ruta en ventanas de 1 minuto
 * durante la última hora. Sin servicios externos ni datos personales (rutas sin identificadores).
 * v2.2 · Cada réplica cuenta en memoria (sin escribir por petición) y sube sus minutos a Postgres
 * (`flushMetrics`, al cambiar de minuto y cada 5 min desde el scheduler); el resumen suma todas las réplicas.
 */
import { randomUUID } from "node:crypto";
const WINDOW_MIN = 60;
const SAMPLES_DB = 200; // muestras de latencia que se suben por ruta y minuto
type Bucket = { minute: number; count: number; errors: number; ms: number[] };
const g = globalThis as unknown as { __lifeosMetrics?: Map<string, Bucket[]>; __lifeosReplica?: string; __lifeosFlushedMinute?: number };
const store = (): Map<string, Bucket[]> => (g.__lifeosMetrics ??= new Map());
/** Identificador de esta réplica (aleatorio por arranque; no es un dato personal). */
export const replicaId = (): string => (g.__lifeosReplica ??= randomUUID());

/** Ruta sin identificadores (cuid, uuid, números, tokens largos): /api/training/sessions/[id]. */
export function routeKey(method: string, path: string): string {
  const p = path
    .split("?")[0]
    .split("/")
    .map((seg) => (/^[0-9]+$/.test(seg) || /^c[a-z0-9]{20,}$/.test(seg) || /^[0-9a-f-]{32,}$/i.test(seg) || seg.length > 40 ? "[id]" : seg))
    .join("/")
    .slice(0, 160);
  return `${method.toUpperCase()} ${p}`;
}

export function recordRequest(method: string, path: string, status: number, ms: number, now = Date.now()) {
  const key = routeKey(method, path);
  const minute = Math.floor(now / 60_000);
  const list = store().get(key) ?? [];
  let b = list.at(-1);
  if (!b || b.minute !== minute) {
    b = { minute, count: 0, errors: 0, ms: [] };
    list.push(b);
    while (list.length && list[0].minute <= minute - WINDOW_MIN) list.shift();
  }
  b.count++;
  if (status >= 500) b.errors++;
  if (b.ms.length < 500) b.ms.push(ms); // muestra acotada por minuto
  store().set(key, list);
  // Al cambiar de minuto se sube lo anterior (sin esperar a la BD ni romper la petición)
  if (g.__lifeosFlushedMinute !== undefined && g.__lifeosFlushedMinute !== minute) void flushMetrics(now).catch(() => {});
  g.__lifeosFlushedMinute = minute;
}

const pct = (sorted: number[], p: number) => (sorted.length ? sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))] : 0);

type Row = { route: string; minute: number; count: number; errors: number; ms: number[] };

/** Filas de esta réplica en la ventana. */
function localRows(since: number): Row[] {
  const rows: Row[] = [];
  for (const [route, list] of store()) for (const b of list) if (b.minute > since) rows.push({ route, ...b });
  return rows;
}

/** Suma las filas (de una o varias réplicas): total y por ruta (las más usadas primero). */
export function summarize(rows: Row[], top = 12) {
  const byRoute = new Map<string, { count: number; errors: number; ms: number[] }>();
  for (const r of rows) {
    const e = byRoute.get(r.route) ?? { count: 0, errors: 0, ms: [] };
    e.count += r.count;
    e.errors += r.errors;
    e.ms.push(...r.ms);
    byRoute.set(r.route, e);
  }
  const routes: Array<{ route: string; count: number; errors: number; p50: number; p95: number }> = [];
  const all: number[] = [];
  let count = 0;
  let errors = 0;
  for (const [route, e] of byRoute) {
    const ms = e.ms.sort((a, b) => a - b);
    routes.push({ route, count: e.count, errors: e.errors, p50: Math.round(pct(ms, 50)), p95: Math.round(pct(ms, 95)) });
    all.push(...ms);
    count += e.count;
    errors += e.errors;
  }
  all.sort((a, b) => a - b);
  routes.sort((a, b) => b.count - a.count);
  return { windowMin: WINDOW_MIN, count, errors, p50: Math.round(pct(all, 50)), p95: Math.round(pct(all, 95)), routes: routes.slice(0, top) };
}

/** Resumen solo de esta réplica (sin BD). */
export function localSummary(now = Date.now(), top = 12) {
  return summarize(localRows(Math.floor(now / 60_000) - WINDOW_MIN), top);
}

/** Sube a Postgres los minutos de esta réplica (reemplaza sus filas: sin sumas concurrentes). */
export async function flushMetrics(now = Date.now()): Promise<void> {
  const { prisma } = await import("@/lib/prisma");
  const rows = localRows(Math.floor(now / 60_000) - WINDOW_MIN);
  const replica = replicaId();
  for (const r of rows) {
    const data = { count: r.count, errors: r.errors, ms: r.ms.slice(0, SAMPLES_DB).map((x) => Math.round(x)) };
    const minute = new Date(r.minute * 60_000);
    await prisma.apiMetricMinute.upsert({ where: { replica_minute_route: { replica, minute, route: r.route } }, create: { replica, minute, route: r.route, ...data }, update: data });
  }
}

/** Resumen de la última hora de TODAS las réplicas. Si la BD no responde, solo la de esta (patrón de rate-limit-db). */
export async function metricsSummary(now = Date.now(), top = 12) {
  const since = Math.floor(now / 60_000) - WINDOW_MIN;
  try {
    const { prisma } = await import("@/lib/prisma");
    await flushMetrics(now);
    const db = await prisma.apiMetricMinute.findMany({ where: { minute: { gt: new Date(since * 60_000) } } });
    return summarize(db.map((r) => ({ route: r.route, minute: Math.floor(r.minute.getTime() / 60_000), count: r.count, errors: r.errors, ms: r.ms })), top);
  } catch {
    return localSummary(now, top);
  }
}

/** Minutos viejos (lo llama el job de conservación). */
export async function pruneMetrics(now = Date.now()) {
  const { prisma } = await import("@/lib/prisma");
  return prisma.apiMetricMinute.deleteMany({ where: { minute: { lt: new Date(now - 2 * 3600_000) } } });
}

/** Solo para tests. */
export function resetMetrics() {
  store().clear();
  g.__lifeosFlushedMinute = undefined;
}

/** Solo para tests: simula otra réplica (otro identificador y memoria vacía). */
export function asReplica(id: string) {
  g.__lifeosReplica = id;
  resetMetrics();
}
