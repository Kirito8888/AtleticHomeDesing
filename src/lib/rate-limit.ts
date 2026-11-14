// Limitador en memoria (ventana deslizante): solo es el respaldo de `rate-limit-db.ts` cuando la BD no
// responde. Las rutas usan el de BD (compartido entre réplicas). Aquí también viven `LIMITS` y `clientIp`.

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
  /** Confirmar o desactivar el 2FA: cada intento prueba un código, por usuario. */
  totpConfirm: { limit: 5, windowMs: 15 * 60_000 },
  passwordCheck: { limit: 5, windowMs: 15 * 60_000 },
  aiChat: { limit: 60, windowMs: 60 * 60_000 },
  aiUpload: { limit: 10, windowMs: 60 * 60_000 },
  photoUpload: { limit: 30, windowMs: 60 * 60_000 },
  /** v2.1 · Clips de ejercicios (hasta 25 MB cada uno). */
  videoUpload: { limit: 20, windowMs: 60 * 60_000 },
  aiGenerate: { limit: 10, windowMs: 60 * 60_000 },
  /** v1.9 · Guardar o probar la IA propia (cada intento llama al proveedor). */
  aiProvider: { limit: 20, windowMs: 60 * 60_000 },
  /** v1.10 · Lectura de tickets y etiquetas con OCR (CPU del servidor). */
  ocr: { limit: 30, windowMs: 60 * 60_000 },
  export: { limit: 5, windowMs: 60 * 60_000 },
  import: { limit: 30, windowMs: 60 * 60_000 },
  planImport: { limit: 20, windowMs: 60 * 60_000 },
  /** Enlaces públicos con token (.ics, informe para la entrenadora), por IP. */
  calendarFeed: { limit: 60, windowMs: 60 * 60_000 },
  sharedReport: { limit: 60, windowMs: 60 * 60_000 },
  /** v2.0 · Compartir mazos de flashcards por email. */
  deckShare: { limit: 30, windowMs: 60 * 60_000 },
  /** v2.1 · Compartir protocolos de fisio y alta de curvas (escrituras de la entrenadora). */
  physioShare: { limit: 60, windowMs: 60 * 60_000 },
  /** Comentarios en sesiones (cada uno puede disparar un push). */
  comment: { limit: 60, windowMs: 60 * 60_000 },
} as const;

/** Proxies de confianza (`TRUSTED_PROXY_HOPS`, 0-5, por defecto 1). Valor no válido → 1. */
function trustedHops(): number {
  const raw = process.env.TRUSTED_PROXY_HOPS;
  if (raw == null || raw === "") return 1;
  const n = Number(raw);
  return Number.isInteger(n) && n >= 0 && n <= 5 ? n : 1;
}

/**
 * IP del cliente tras el reverse proxy. Con N proxies de confianza (`TRUSTED_PROXY_HOPS`) se toma la
 * entrada N-ésima contando desde el final de X-Forwarded-For (las de la izquierda las pone el cliente y se
 * pueden falsificar). Con 0 proxies, o con menos entradas que proxies, la cabecera no es de fiar:
 * `unknown` (Next 16 no expone la IP del socket). Requiere que la app solo sea accesible a través del proxy.
 */
export function clientIp(headers: Headers, hops = trustedHops()): string {
  if (hops <= 0) return "unknown";
  const parts = (headers.get("x-forwarded-for") ?? "").split(",").map((p) => p.trim());
  const picked = parts.length >= hops ? parts[parts.length - hops] : "";
  if (picked) return picked;
  if (hops === 1) return headers.get("x-real-ip")?.trim() || "unknown";
  return "unknown";
}
