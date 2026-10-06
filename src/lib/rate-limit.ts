// Limitador de peticiones en memoria (ventana deslizante). Suficiente para un
// único contenedor web; con varias réplicas habría que moverlo a Postgres/Redis.

export interface RateLimitResult {
  ok: boolean;
  remaining: number;
  /** Segundos hasta que se libera un hueco (0 si ok). */
  retryAfterSec: number;
}

type Store = Map<string, number[]>;

const globalStore = globalThis as unknown as { __lifeosRateLimit?: Store };

function store(): Store {
  globalStore.__lifeosRateLimit ??= new Map();
  return globalStore.__lifeosRateLimit;
}

/** Registra un intento para `key` y dice si cabe en `limit` intentos por `windowMs`. */
export function rateLimit(key: string, limit: number, windowMs: number, now = Date.now(), s: Store = store()): RateLimitResult {
  const since = now - windowMs;
  const hits = (s.get(key) ?? []).filter((t) => t > since);
  if (hits.length >= limit) {
    s.set(key, hits);
    return { ok: false, remaining: 0, retryAfterSec: Math.max(1, Math.ceil((hits[0] + windowMs - now) / 1000)) };
  }
  hits.push(now);
  s.set(key, hits);
  if (s.size > 10_000) prune(s, now, windowMs);
  return { ok: true, remaining: limit - hits.length, retryAfterSec: 0 };
}

function prune(s: Store, now: number, windowMs: number) {
  for (const [k, v] of s) if (!v.some((t) => t > now - windowMs)) s.delete(k);
}

/** Límites de la aplicación (intentos / ventana). */
export const LIMITS = {
  login: { limit: 10, windowMs: 15 * 60_000 },
  register: { limit: 5, windowMs: 60 * 60_000 },
  passwordCheck: { limit: 5, windowMs: 15 * 60_000 },
  aiChat: { limit: 60, windowMs: 60 * 60_000 },
  aiUpload: { limit: 10, windowMs: 60 * 60_000 },
  aiGenerate: { limit: 10, windowMs: 60 * 60_000 },
  export: { limit: 5, windowMs: 60 * 60_000 },
  import: { limit: 30, windowMs: 60 * 60_000 },
  planImport: { limit: 20, windowMs: 60 * 60_000 },
} as const;

/**
 * IP del cliente tras el reverse proxy. Se toma la ÚLTIMA entrada de
 * X-Forwarded-For: la añade nuestro proxy (NPM/nginx, $proxy_add_x_forwarded_for).
 * Las anteriores las pone el cliente y se pueden falsificar para saltarse el límite.
 * Requiere que la app solo sea accesible a través del proxy (WEB_BIND=127.0.0.1).
 */
export function clientIp(headers: Headers): string {
  const xff = headers.get("x-forwarded-for");
  const last = xff?.split(",").at(-1)?.trim();
  if (last) return last;
  return headers.get("x-real-ip")?.trim() || "unknown";
}
