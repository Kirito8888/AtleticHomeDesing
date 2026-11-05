import "server-only";

import { ApiError } from "@/lib/api";
import { env } from "@/lib/env";
import { log } from "@/lib/log";

import { IMAGE_INVALID_CODE, shrinkImage } from "./image-shrink";
import type { AiClient, ChatTurn } from "./provider";

/**
 * IA local (llama.cpp / `llama-server`, API compatible con OpenAI) en OTRO equipo de la red.
 * Solo servidor. Se configura con LOCAL_AI_BASE_URL, LOCAL_AI_KEY y LOCAL_AI_MODEL (nunca NEXT_PUBLIC_).
 *
 *  - Antes de cada operación se consulta `GET <origen>/health` (1,5 s; resultado en caché unos segundos).
 *  - Atiende de una en una: las llamadas pasan por un limitador de concurrencia 1 en proceso.
 *  - Solo se lee `message.content`; `reasoning_content` se ignora.
 *  - El razonamiento (`enable_thinking`) va apagado salvo que se pida con `thinking: true`.
 */

export type LocalAiConfig = { baseUrl: string; apiKey: string | null; model: string; timeoutMs: number };

export const HEALTH_TIMEOUT_MS = 1_500;
const HEALTH_TTL_MS = 3_000;
/** ~4 caracteres por token (estimación; el servidor no ofrece un tokenizador barato). */
export const CHARS_PER_TOKEN = 4;
/** Tamaño máximo de un trozo al resumir textos largos (el contexto del servidor es de 65 536 tokens). */
export const CHUNK_TOKENS = 40_000;
/** Por encima de esto el mensaje se condensa antes de enviarlo (deja hueco a la salida y al sistema). */
export const CONDENSE_ABOVE_TOKENS = 48_000;
/** Tope de una imagen enviada al modelo local; las mayores se reducen antes con sharp (L4). */
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

/** Configuración del servidor local, o null si no está definido. */
export function localConfig(): LocalAiConfig | null {
  const e = env();
  if (!e.LOCAL_AI_BASE_URL) return null;
  return { baseUrl: e.LOCAL_AI_BASE_URL.replace(/\/+$/, ""), apiKey: e.LOCAL_AI_KEY ?? null, model: e.LOCAL_AI_MODEL, timeoutMs: e.LOCAL_AI_TIMEOUT_MS };
}

/** L1 · ¿Solo IA local? (LOCAL_AI_ONLY=true): nunca se usa otro proveedor, ni para chat ni para embeddings. */
export function localOnly(): boolean {
  return env().LOCAL_AI_ONLY === true;
}

// Limitador de concurrencia -----------------------------------------------------------------------

/** Cola FIFO con `max` ejecuciones simultáneas. Sin dependencias; vale para un único proceso. */
export function createLimiter(max = 1) {
  let active = 0;
  const waiting: Array<() => void> = [];
  const release = () => {
    active--;
    waiting.shift()?.();
  };
  const acquire = async () => {
    if (active >= max) await new Promise<void>((resolve) => waiting.push(resolve));
    active++;
  };
  return {
    async run<T>(fn: () => Promise<T>): Promise<T> {
      await acquire();
      try {
        return await fn();
      } finally {
        release();
      }
    },
    /** Para flujos: devuelve la función que libera el hueco. */
    acquire: async () => {
      await acquire();
      let done = false;
      return () => {
        if (!done) {
          done = true;
          release();
        }
      };
    },
    get pending() {
      return waiting.length;
    },
  };
}

export const localLimiter = createLimiter(1);

// Salud -------------------------------------------------------------------------------------------

let healthCache: { url: string; ok: boolean; at: number } | null = null;

/** `/health` cuelga del origen, no de `/v1`. */
export function healthUrl(baseUrl: string): string {
  return `${new URL(baseUrl).origin}/health`;
}

/** ¿Responde el servidor local? Nunca lanza. */
export async function localHealthy(cfg: LocalAiConfig, now = Date.now()): Promise<boolean> {
  if (healthCache && healthCache.url === cfg.baseUrl && now - healthCache.at < HEALTH_TTL_MS) return healthCache.ok;
  let ok = false;
  try {
    const res = await fetch(healthUrl(cfg.baseUrl), { signal: AbortSignal.timeout(HEALTH_TIMEOUT_MS), redirect: "error" });
    ok = res.ok;
  } catch {
    ok = false;
  }
  healthCache = { url: cfg.baseUrl, ok, at: now };
  return ok;
}

/** Solo para tests. */
export function resetLocalHealthCache() {
  healthCache = null;
}

// Troceado ----------------------------------------------------------------------------------------

export const estimateTokens = (s: string) => Math.ceil(s.length / CHARS_PER_TOKEN);

/** Trozos de ≤ `maxTokens` estimados, cortando en salto de párrafo/línea/espacio cuando se puede. */
export function chunkByTokens(text: string, maxTokens = CHUNK_TOKENS): string[] {
  const max = Math.max(1, maxTokens) * CHARS_PER_TOKEN;
  const out: string[] = [];
  let rest = text;
  while (rest.length > max) {
    const window = rest.slice(0, max);
    let cut = Math.max(window.lastIndexOf("\n\n"), window.lastIndexOf("\n"), window.lastIndexOf(" "));
    if (cut < max * 0.5) cut = max;
    out.push(rest.slice(0, cut));
    rest = rest.slice(cut);
  }
  if (rest.trim()) out.push(rest);
  return out;
}

const SUMMARY_SYSTEM = "Resume el texto conservando definiciones, cifras, nombres, fórmulas y la estructura de temas. Sin añadir nada que no esté en el texto. Responde en el mismo idioma.";

/**
 * Condensa un texto largo: resume cada trozo y, si la suma sigue siendo grande, resume los resúmenes.
 * `summarize` hace una llamada al modelo (inyectable para los tests).
 */
export async function condenseText(text: string, summarize: (chunk: string) => Promise<string>, limitTokens = CONDENSE_ABOVE_TOKENS): Promise<string> {
  let current = text;
  for (let round = 0; round < 4 && estimateTokens(current) > limitTokens; round++) {
    const parts: string[] = [];
    for (const chunk of chunkByTokens(current)) parts.push(await summarize(chunk));
    const next = parts.join("\n\n");
    if (next.length >= current.length) break; // el modelo no reduce: no insistir
    current = next;
  }
  return current;
}

// Llamadas ----------------------------------------------------------------------------------------

/** Error del servidor local (red, 4xx/5xx o respuesta vacía): `localFirst` lo trata con el respaldo. */
export class LocalAiError extends ApiError {}

type ChatParams = Parameters<AiClient["text"]>[0];

export function withSchema(system: string, schema: Record<string, unknown>) {
  return `${system}\n\nResponde únicamente con un objeto JSON válido, sin texto antes ni después, que cumpla este esquema JSON:\n${JSON.stringify(schema)}`;
}

function imageBytes(b64: string) {
  return Math.floor((b64.length * 3) / 4);
}

export function buildBody(cfg: LocalAiConfig, p: ChatParams, stream: boolean): Record<string, unknown> {
  return {
    model: cfg.model,
    temperature: p.temperature ?? 0.3,
    ...(p.maxOutputTokens ? { max_tokens: p.maxOutputTokens } : {}),
    messages: [
      { role: "system", content: p.json ? withSchema(p.system, p.json) : p.system },
      ...p.messages.map((m: ChatTurn) => ({
        role: m.role,
        content: m.images?.length ? [...m.images.map((i) => ({ type: "image_url", image_url: { url: `data:${i.mime};base64,${i.base64}` } })), { type: "text", text: m.text }] : m.text,
      })),
    ],
    ...(p.json ? { response_format: { type: "json_object" } } : {}),
    chat_template_kwargs: { enable_thinking: p.thinking === true },
    ...(stream ? { stream: true, stream_options: { include_usage: true } } : {}),
  };
}

function headers(cfg: LocalAiConfig): Record<string, string> {
  return { "content-type": "application/json", ...(cfg.apiKey ? { authorization: `Bearer ${cfg.apiKey}` } : {}) };
}

function fail(status: number | null, detail: string, cfg: LocalAiConfig): LocalAiError {
  let msg = detail.replace(/\s+/g, " ").slice(0, 200);
  if (cfg.apiKey) msg = msg.split(cfg.apiKey).join("•••");
  return new LocalAiError(502, `El servidor de IA local falló${status ? ` (${status})` : ""}: ${msg || "sin detalle"}`, { code: "ai_local_failed" });
}

/**
 * L4 · Las imágenes de más de 5 MB se reducen con sharp (JPEG ≤ 2048 px); las demás no se tocan.
 * @throws LocalAiError 422 `ai_local_image_invalid` si no es una imagen procesable; 413 si aun reducida no cabe.
 */
async function prepareImages(p: ChatParams): Promise<ChatParams> {
  if (!p.messages.some((m) => m.images?.some((i) => imageBytes(i.base64) > MAX_IMAGE_BYTES))) return p;
  const messages: ChatTurn[] = [];
  for (const m of p.messages) {
    if (!m.images?.length) {
      messages.push(m);
      continue;
    }
    const images: NonNullable<ChatTurn["images"]> = [];
    for (const i of m.images) {
      if (imageBytes(i.base64) <= MAX_IMAGE_BYTES) {
        images.push(i);
        continue;
      }
      let r: Awaited<ReturnType<typeof shrinkImage>>;
      try {
        r = await shrinkImage(Buffer.from(i.base64, "base64"));
      } catch (e) {
        throw new LocalAiError(422, "La imagen no se puede procesar", { code: IMAGE_INVALID_CODE, cause: e instanceof Error ? e.message : undefined });
      }
      if (r.buffer.length > MAX_IMAGE_BYTES) throw new LocalAiError(413, "Imagen demasiado grande para el modelo local", { code: "ai_local_image" });
      log.info("ia: imagen reducida", { kind: "ai-local", count: r.buffer.length });
      images.push({ mime: r.mime, base64: r.buffer.toString("base64") });
    }
    messages.push({ ...m, images });
  }
  return { ...p, messages };
}

/** Una respuesta completa. NO pasa por la cola: lo hace quien llama. */
export async function localChat(cfg: LocalAiConfig, pIn: ChatParams): Promise<{ text: string; inputTokens?: number; outputTokens?: number }> {
  const p = await prepareImages(pIn);
  let res: Response;
  try {
    res = await fetch(`${cfg.baseUrl}/chat/completions`, { method: "POST", headers: headers(cfg), body: JSON.stringify(buildBody(cfg, p, false)), redirect: "error", signal: AbortSignal.timeout(cfg.timeoutMs) });
  } catch (e) {
    throw fail(null, e instanceof Error ? e.message : "sin conexión", cfg);
  }
  const raw = await res.text();
  if (!res.ok) throw fail(res.status, raw, cfg);
  let json: { choices?: Array<{ message?: { content?: string | null } }>; usage?: { prompt_tokens?: number; completion_tokens?: number } };
  try {
    json = JSON.parse(raw);
  } catch {
    throw fail(res.status, "respuesta que no es JSON", cfg);
  }
  // Solo `content`: `reasoning_content` es el razonamiento interno y no debe llegar a nadie.
  const text = json.choices?.[0]?.message?.content;
  if (!text?.trim()) throw fail(res.status, "respuesta vacía", cfg);
  return { text, inputTokens: json.usage?.prompt_tokens, outputTokens: json.usage?.completion_tokens };
}

/**
 * Respuesta en streaming (SSE de OpenAI): emite solo `delta.content`. Ocupa el hueco de la cola mientras dura.
 * Pensado para rutas que deban enviar datos al navegador antes de los 60 s del proxy.
 */
export async function* localChatStream(cfg: LocalAiConfig, pIn: ChatParams, limiter = localLimiter): AsyncGenerator<string, { outputTokens?: number }> {
  const p = await prepareImages(pIn);
  const release = await limiter.acquire();
  try {
    let res: Response;
    try {
      res = await fetch(`${cfg.baseUrl}/chat/completions`, { method: "POST", headers: headers(cfg), body: JSON.stringify(buildBody(cfg, p, true)), redirect: "error", signal: AbortSignal.timeout(cfg.timeoutMs) });
    } catch (e) {
      throw fail(null, e instanceof Error ? e.message : "sin conexión", cfg);
    }
    if (!res.ok || !res.body) throw fail(res.status, await res.text().catch(() => ""), cfg);
    const reader = res.body.getReader();
    const dec = new TextDecoder();
    let buf = "";
    let outputTokens: number | undefined;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      let nl: number;
      while ((nl = buf.indexOf("\n")) >= 0) {
        const line = buf.slice(0, nl).trim();
        buf = buf.slice(nl + 1);
        if (!line.startsWith("data:")) continue;
        const data = line.slice(5).trim();
        if (data === "[DONE]") return { outputTokens };
        try {
          const j = JSON.parse(data) as { choices?: Array<{ delta?: { content?: string | null } }>; usage?: { completion_tokens?: number } };
          if (j.usage?.completion_tokens) outputTokens = j.usage.completion_tokens;
          const piece = j.choices?.[0]?.delta?.content;
          if (piece) yield piece;
        } catch {
          // línea parcial o de control: se ignora
        }
      }
    }
    return { outputTokens };
  } finally {
    release();
  }
}

// Cliente con respaldo ----------------------------------------------------------------------------

/**
 * Cliente «local primero». Si el servidor no responde a `/health` o falla a mitad, usa `fallback`
 * (la IA que habría tocado sin servidor local: la propia de la usuaria o la Gemini del servidor).
 * Los embeddings siguen siendo los de `fallback` (el modelo local no los ofrece).
 * Con `only` (LOCAL_AI_ONLY) no hay respaldo ni embeddings: local apagado → 503 `ai_local_down`; fallo a mitad → el error del local.
 */
export function localFirst(cfg: LocalAiConfig, fallbackIn: AiClient | null, limiter = localLimiter, opts: { only?: boolean } = {}): AiClient {
  // Solo IA local: el respaldo no existe (ni chat ni embeddings → los apuntes se buscan por texto)
  const fallback = opts.only ? null : fallbackIn;
  return {
    provider: "OPENAI",
    source: "server",
    chatModel: cfg.model,
    embedTag: fallback?.embedTag ?? null,
    embed: fallback?.embed ?? null,
    async text(p) {
      const healthy = await localHealthy(cfg);
      if (!healthy && opts.only) {
        log.warn("ia: solo IA local y el servidor local está apagado", { kind: "ai-local" });
        throw new ApiError(503, "El servidor de IA local no responde. Esta instalación solo usa IA local: vuelve a intentarlo cuando esté encendido.", { code: "ai_local_down" });
      }
      if (healthy) {
        const t0 = Date.now();
        try {
          const prepared = await condenseLong(cfg, p, limiter);
          const r = await limiter.run(() => localChat(cfg, prepared));
          log.info("ia: proveedor local", { kind: "ai-local", ms: Date.now() - t0, count: r.outputTokens ?? 0 });
          return r;
        } catch (e) {
          // Imagen no procesable: es un fallo de la entrada, no del servidor local; otro proveedor no la arregla
          if (!fallback || (e instanceof ApiError && (e.details as { code?: string } | undefined)?.code === IMAGE_INVALID_CODE)) throw e;
          log.warn("ia: el servidor local falló, se usa el respaldo", { kind: "ai-local", code: e instanceof ApiError ? e.status : "error", ms: Date.now() - t0 });
        }
      } else {
        log.info("ia: servidor local apagado, se usa el respaldo", { kind: "ai-local" });
      }
      if (!fallback) throw new ApiError(503, "El servidor de IA local no responde y no hay otra IA configurada", { code: "ai_not_configured" });
      const r = await fallback.text(p);
      log.info("ia: proveedor de respaldo", { kind: "ai-fallback", count: r.outputTokens ?? 0 });
      return r;
    },
  };
}

/** Si el último mensaje no cabe en el contexto, lo condensa por trozos (solo con el modelo local). */
async function condenseLong(cfg: LocalAiConfig, p: ChatParams, limiter: ReturnType<typeof createLimiter>): Promise<ChatParams> {
  const last = p.messages[p.messages.length - 1];
  if (!last || estimateTokens(last.text) <= CONDENSE_ABOVE_TOKENS) return p;
  const text = await condenseText(last.text, (chunk) =>
    limiter.run(async () => (await localChat(cfg, { system: SUMMARY_SYSTEM, messages: [{ role: "user", text: chunk }], temperature: 0.2 })).text),
  );
  log.info("ia: texto largo condensado", { kind: "ai-local", count: estimateTokens(text) });
  return { ...p, messages: [...p.messages.slice(0, -1), { ...last, text }] };
}
