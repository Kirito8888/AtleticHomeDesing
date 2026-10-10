/**
 * v1.9 · Métricas internas de la API, en memoria (un solo contenedor `web`): peticiones, errores 5xx
 * y latencias por ruta en ventanas de 1 minuto durante la última hora. Sin servicios externos ni
 * datos personales (rutas sin identificadores). Se reinician al reiniciar el contenedor.
 */
const WINDOW_MIN = 60;
type Bucket = { minute: number; count: number; errors: number; ms: number[] };
const g = globalThis as unknown as { __lifeosMetrics?: Map<string, Bucket[]> };
const store = (): Map<string, Bucket[]> => (g.__lifeosMetrics ??= new Map());

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
}

const pct = (sorted: number[], p: number) => (sorted.length ? sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))] : 0);

/** Resumen de la última hora: total y por ruta (las más usadas primero). */
export function metricsSummary(now = Date.now(), top = 12) {
  const since = Math.floor(now / 60_000) - WINDOW_MIN;
  const routes: Array<{ route: string; count: number; errors: number; p50: number; p95: number }> = [];
  const all: number[] = [];
  let count = 0;
  let errors = 0;
  for (const [route, list] of store()) {
    const recent = list.filter((b) => b.minute > since);
    if (!recent.length) continue;
    const ms = recent.flatMap((b) => b.ms).sort((a, b) => a - b);
    const c = recent.reduce((a, b) => a + b.count, 0);
    const e = recent.reduce((a, b) => a + b.errors, 0);
    routes.push({ route, count: c, errors: e, p50: Math.round(pct(ms, 50)), p95: Math.round(pct(ms, 95)) });
    all.push(...ms);
    count += c;
    errors += e;
  }
  all.sort((a, b) => a - b);
  routes.sort((a, b) => b.count - a.count);
  return { windowMin: WINDOW_MIN, count, errors, p50: Math.round(pct(all, 50)), p95: Math.round(pct(all, 95)), routes: routes.slice(0, top) };
}

/** Solo para tests. */
export function resetMetrics() {
  store().clear();
}
