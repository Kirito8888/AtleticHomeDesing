import "server-only";

import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

import { GoogleGenAI, HarmBlockThreshold, HarmCategory } from "@google/genai";
import { z } from "zod";

import { ApiError } from "@/lib/api";
import { env } from "@/lib/env";
import { localConfig, localFirst, withSchema } from "@/lib/ai/local";
import { log } from "@/lib/log";
import { prisma } from "@/lib/prisma";
import { openJson } from "@/lib/security/data-key";

/**
 * v1.9 · IA propia de cada usuario, con cualquier proveedor.
 *  - GEMINI: Google (SDK oficial). Es también el respaldo del servidor si hay GEMINI_API_KEY.
 *  - OPENAI: cualquier API «compatible con OpenAI» (OpenAI, Mistral, Groq, DeepSeek, OpenRouter…)
 *    y modelos locales (Ollama, LM Studio, vLLM) en las URL que autorice la administración.
 *  - ANTHROPIC: API de mensajes de Claude (sin embeddings: los apuntes se buscan por texto).
 * La clave se guarda cifrada (DATA_ENCRYPTION_KEY) y nunca sale en respuestas, logs ni exportaciones.
 */

export const AI_PROVIDERS = ["GEMINI", "OPENAI", "ANTHROPIC"] as const;
export type AiProvider = (typeof AI_PROVIDERS)[number];

/** Dimensión de la columna pgvector de los apuntes. Un modelo de embeddings con otra salida no vale. */
export const EMBED_DIM = 768;

/** Servicios compatibles con OpenAI que se pueden elegir sin escribir la URL. */
export const OPENAI_PRESETS = {
  openai: { label: "OpenAI", baseUrl: "https://api.openai.com/v1" },
  mistral: { label: "Mistral", baseUrl: "https://api.mistral.ai/v1" },
  groq: { label: "Groq", baseUrl: "https://api.groq.com/openai/v1" },
  deepseek: { label: "DeepSeek", baseUrl: "https://api.deepseek.com/v1" },
  openrouter: { label: "OpenRouter", baseUrl: "https://openrouter.ai/api/v1" },
  together: { label: "Together", baseUrl: "https://api.together.xyz/v1" },
} as const;

export const ANTHROPIC_URL = "https://api.anthropic.com/v1";
const ANTHROPIC_VERSION = "2023-06-01";
const TIMEOUT_MS = 120_000;

/** v1.10 · `images`: fotos JPEG o PNG en base64 (sin EXIF; las reescala el navegador). */
export type ChatTurn = { role: "user" | "assistant"; text: string; images?: Array<{ mime: "image/jpeg" | "image/png"; base64: string }> };
export type EmbedTask = "RETRIEVAL_DOCUMENT" | "RETRIEVAL_QUERY";

export interface AiClient {
  provider: AiProvider;
  /** De quién es la clave: la propia del usuario o la del servidor (respaldo). */
  source: "user" | "server";
  chatModel: string;
  /** Identifica los vectores de los apuntes (modelo y dimensión); null = sin embeddings, búsqueda por texto. */
  embedTag: string | null;
  /** `json`: esquema JSON de la respuesta (Gemini lo impone al decodificar; el resto lo recibe en las instrucciones). */
  text(p: { system: string; messages: ChatTurn[]; temperature?: number; json?: Record<string, unknown>; maxOutputTokens?: number; thinking?: boolean }): Promise<{ text: string; inputTokens?: number; outputTokens?: number }>;
  embed: ((texts: string[], task: EmbedTask) => Promise<number[][]>) | null;
}

export type AiConfig = { provider: AiProvider; baseUrl: string | null; model: string; embeddingModel: string | null; apiKey: string | null };

// URL ---------------------------------------------------------------------------------------------

/** URL locales (Ollama, LM Studio…) que la administración permite en AI_LOCAL_BASE_URLS (separadas por comas). */
export function localBaseUrls(): string[] {
  return (env().AI_LOCAL_BASE_URLS ?? "")
    .split(",")
    .map((u) => normalizeUrl(u))
    .filter((u): u is string => Boolean(u));
}

export function normalizeUrl(raw: string | null | undefined): string | null {
  if (!raw?.trim()) return null;
  try {
    const u = new URL(raw.trim());
    if (u.username || u.password || u.search || u.hash) return null;
    return `${u.origin}${u.pathname.replace(/\/+$/, "")}`;
  } catch {
    return null;
  }
}

/** IPv4/IPv6 privada, local, de enlace o reservada: no se permiten en URL escritas por usuarios (SSRF). */
export function isPrivateAddress(ip: string): boolean {
  const v = isIP(ip);
  if (v === 4) {
    const [a, b] = ip.split(".").map(Number);
    return a === 0 || a === 10 || a === 127 || (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 198 && (b === 18 || b === 19)) || a >= 224;
  }
  if (v === 6) {
    const x = ip.toLowerCase();
    if (x.startsWith("::ffff:")) return isPrivateAddress(x.slice(7));
    return x === "::" || x === "::1" || x.startsWith("fc") || x.startsWith("fd") || x.startsWith("fe8") || x.startsWith("fe9") || x.startsWith("fea") || x.startsWith("feb") || x.startsWith("ff");
  }
  return true;
}

/**
 * Comprueba la URL de un proveedor compatible con OpenAI antes de cada uso:
 * las predefinidas y las locales autorizadas valen; cualquier otra debe ser https y resolver a IP pública.
 */
export async function assertSafeBaseUrl(raw: string): Promise<string> {
  const url = normalizeUrl(raw);
  if (!url) throw new ApiError(400, "URL del proveedor no válida");
  const known = Object.values(OPENAI_PRESETS).some((p) => p.baseUrl === url) || localBaseUrls().includes(url);
  if (known) return url;
  const u = new URL(url);
  if (u.protocol !== "https:") throw new ApiError(400, "La URL del proveedor debe ser https (los modelos locales los autoriza la administración con AI_LOCAL_BASE_URLS)");
  const host = u.hostname.replace(/^\[|\]$/g, "");
  const addrs = isIP(host) ? [{ address: host }] : await lookup(host, { all: true }).catch(() => []);
  if (!addrs.length) throw new ApiError(400, "No se encuentra el servidor del proveedor");
  if (addrs.some((a) => isPrivateAddress(a.address))) throw new ApiError(400, "Esa URL apunta a una red interna: solo la administración puede autorizarla (AI_LOCAL_BASE_URLS)");
  return url;
}

// Errores -----------------------------------------------------------------------------------------

/** Mensaje de error sin la clave (por si un proveedor la repite) y sin cuerpos largos. */
export function providerError(provider: AiProvider, status: number | null, detail: string, apiKey: string | null): ApiError {
  let msg = detail.replace(/\s+/g, " ").slice(0, 200);
  if (apiKey) msg = msg.split(apiKey).join("•••");
  msg = msg.replace(/(sk-|AIza|sk-ant-)[A-Za-z0-9_-]{8,}/g, "•••");
  const name = provider === "GEMINI" ? "Google Gemini" : provider === "ANTHROPIC" ? "Anthropic" : "el proveedor de IA";
  if (status === 401 || status === 403) return new ApiError(502, `${name} rechaza la clave (${status}). Revísala en Ajustes → IA.`, { code: "ai_key_rejected" });
  if (status === 429) return new ApiError(429, `${name} ha limitado las peticiones (429). Prueba más tarde o revisa tu cuota.`);
  // Caída o saturación temporal del proveedor (500/502/503/504 o sin conexión): quien genera por partes puede esperar y repetir.
  const transient = status === null || status === 500 || status === 502 || status === 503 || status === 504;
  return new ApiError(502, `${name} respondió con un error${status ? ` (${status})` : ""}: ${msg || "sin detalle"}`, transient ? { code: "ai_overloaded" } : undefined);
}

/** ¿El error es de saturación o caída temporal del proveedor (merece esperar y reintentar)? 429 también. */
export function isTransientAiError(e: unknown): boolean {
  if (!(e instanceof ApiError)) return false;
  return e.status === 429 || (e.details as { code?: string } | undefined)?.code === "ai_overloaded";
}

async function postJson(provider: AiProvider, url: string, headers: Record<string, string>, body: unknown, apiKey: string | null): Promise<unknown> {
  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json", ...headers },
      body: JSON.stringify(body),
      redirect: "error",
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (e) {
    throw providerError(provider, null, e instanceof Error ? e.message : "sin conexión", apiKey);
  }
  const text = await res.text();
  if (!res.ok) throw providerError(provider, res.status, text, apiKey);
  try {
    return JSON.parse(text);
  } catch {
    throw providerError(provider, res.status, "respuesta que no es JSON", apiKey);
  }
}

export function l2normalize(v: number[]): number[] {
  const norm = Math.sqrt(v.reduce((a, x) => a + x * x, 0)) || 1;
  return v.map((x) => x / norm);
}

function checkVectors(provider: AiProvider, vectors: number[][], expected: number): number[][] {
  if (vectors.length !== expected) throw new ApiError(502, "Respuesta de embeddings incompleta");
  const bad = vectors.find((v) => v.length !== EMBED_DIM);
  if (bad) {
    throw new ApiError(422, `El modelo de embeddings devuelve ${bad.length} dimensiones y Atlenza necesita ${EMBED_DIM} (p. ej. text-embedding-3-small, nomic-embed-text o gemini-embedding-001). Déjalo vacío para buscar por texto.`, { code: "embed_dim" });
  }
  return vectors.map(l2normalize);
}

// Proveedores -------------------------------------------------------------------------------------

const EMBED_BATCH = 100;

// Respuesta vacía de Gemini ------------------------------------------------------------------------

/** Tope de salida por defecto de Gemini: sin él, el modelo usa el suyo y un JSON largo puede cortarse. */
export const GEMINI_DEFAULT_MAX_OUTPUT = 8192;

/** Seguridad tolerante con contenido académico (comandos, redes, seguridad informática): solo bloquea lo muy probable. */
export const GEMINI_SAFETY = [
  HarmCategory.HARM_CATEGORY_HARASSMENT,
  HarmCategory.HARM_CATEGORY_HATE_SPEECH,
  HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT,
  HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT,
].map((category) => ({ category, threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH }));

/** Forma mínima de la respuesta de Gemini que nos importa (facilita probarlo sin el SDK). */
export interface GeminiLike {
  text?: string;
  candidates?: { finishReason?: string }[];
  promptFeedback?: { blockReason?: string };
  usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number; thoughtsTokenCount?: number };
}

const EMPTY_HINT: Record<string, string> = {
  RECITATION: "repite literalmente demasiado texto de las fuentes",
  SAFETY: "bloqueada por los filtros de seguridad",
  PROHIBITED_CONTENT: "bloqueada por los filtros de contenido",
  BLOCKLIST: "bloqueada por los filtros de contenido",
  SPII: "bloqueada por datos personales",
  MAX_TOKENS: "cortada por el límite de salida",
  OTHER: "sin motivo indicado",
};

/**
 * Lee la respuesta de Gemini. Si no hay texto utilizable (vacía, bloqueada o cortada por `MAX_TOKENS`) deja un aviso en el registro
 * (solo motivo y tokens, nunca contenido) y lanza `ApiError(502, …, { code: "ai_empty", reason })`.
 * Los tokens de salida incluyen los de «pensar» (`thoughtsTokenCount`), que también se facturan.
 */
export function readGeminiResponse(res: GeminiLike): { text: string; inputTokens?: number; outputTokens?: number } {
  const u = res.usageMetadata;
  const outputTokens = u?.candidatesTokenCount === undefined && u?.thoughtsTokenCount === undefined ? undefined : (u?.candidatesTokenCount ?? 0) + (u?.thoughtsTokenCount ?? 0);
  const finish = res.candidates?.[0]?.finishReason;
  const reason = res.promptFeedback?.blockReason ?? (finish && finish !== "STOP" ? finish : undefined);
  const text = res.text ?? "";
  if (!text || finish === "MAX_TOKENS") {
    const why = reason ?? "OTHER";
    log.warn("respuesta de la IA sin contenido utilizable", { kind: "gemini", code: why, count: outputTokens ?? 0 });
    throw new ApiError(502, `Google Gemini no devolvió contenido (${EMPTY_HINT[why] ?? why.toLowerCase()})`, { code: "ai_empty", reason: why });
  }
  return { text, inputTokens: u?.promptTokenCount, outputTokens };
}

function geminiClient(cfg: AiConfig, source: AiClient["source"]): AiClient {
  const key = cfg.apiKey;
  if (!key) throw new ApiError(503, "Falta la clave de Google Gemini");
  const sdk = new GoogleGenAI({ apiKey: key, httpOptions: { timeout: TIMEOUT_MS } });
  const wrap = async <T,>(fn: () => Promise<T>): Promise<T> => {
    try {
      return await fn();
    } catch (e) {
      if (e instanceof ApiError) throw e;
      const status = typeof (e as { status?: unknown }).status === "number" ? (e as { status: number }).status : null;
      throw providerError("GEMINI", status, e instanceof Error ? e.message : String(e), key);
    }
  };
  const embeddingModel = cfg.embeddingModel;
  return {
    provider: "GEMINI",
    source,
    chatModel: cfg.model,
    // Mismo identificador que antes de la v1.9: los apuntes ya vectorizados con Gemini siguen valiendo
    embedTag: embeddingModel ? `${embeddingModel}@${EMBED_DIM}` : null,
    async text({ system, messages, temperature, json, maxOutputTokens }) {
      const res = await wrap(() =>
        sdk.models.generateContent({
          model: cfg.model,
          contents: messages.map((m) => ({ role: m.role === "assistant" ? "model" : "user", parts: [...(m.images ?? []).map((i) => ({ inlineData: { mimeType: i.mime, data: i.base64 } })), { text: m.text }] })),
          config: { systemInstruction: system, temperature: temperature ?? 0.3, maxOutputTokens: maxOutputTokens ?? GEMINI_DEFAULT_MAX_OUTPUT, safetySettings: GEMINI_SAFETY, ...(json ? { responseMimeType: "application/json", responseJsonSchema: json } : {}) },
        }),
      );
      return readGeminiResponse(res);
    },
    embed: embeddingModel
      ? async (texts, task) => {
          const out: number[][] = [];
          for (let i = 0; i < texts.length; i += EMBED_BATCH) {
            const batch = texts.slice(i, i + EMBED_BATCH);
            const res = await wrap(() => sdk.models.embedContent({ model: embeddingModel, contents: batch, config: { taskType: task, outputDimensionality: EMBED_DIM } }));
            // Google solo normaliza la salida de 3072 dimensiones: se normaliza aquí (L2)
            out.push(...checkVectors("GEMINI", res.embeddings?.map((e) => e.values ?? []) ?? [], batch.length));
          }
          return out;
        }
      : null,
  };
}

const openAiChat = z.object({
  choices: z.array(z.object({ message: z.object({ content: z.string().nullable() }) })).min(1),
  usage: z.object({ prompt_tokens: z.number().optional(), completion_tokens: z.number().optional() }).optional(),
});
const openAiEmbed = z.object({ data: z.array(z.object({ embedding: z.array(z.number()), index: z.number().optional() })) });

function openAiClient(cfg: AiConfig, source: AiClient["source"]): AiClient {
  if (!cfg.baseUrl) throw new ApiError(400, "Falta la URL del proveedor");
  const base = cfg.baseUrl;
  const headers: Record<string, string> = cfg.apiKey ? { authorization: `Bearer ${cfg.apiKey}` } : {};
  const host = new URL(base).host;
  const embeddingModel = cfg.embeddingModel;
  return {
    provider: "OPENAI",
    source,
    chatModel: cfg.model,
    embedTag: embeddingModel ? `openai:${host}:${embeddingModel}@${EMBED_DIM}` : null,
    async text({ system, messages, temperature, json }) {
      const url = `${await assertSafeBaseUrl(base)}/chat/completions`;
      const raw = await postJson(
        "OPENAI",
        url,
        headers,
        {
          model: cfg.model,
          temperature: temperature ?? 0.3,
          messages: [{ role: "system", content: json ? withSchema(system, json) : system }, ...messages.map((m) => ({ role: m.role, content: m.images?.length ? [...m.images.map((i) => ({ type: "image_url", image_url: { url: `data:${i.mime};base64,${i.base64}` } })), { type: "text", text: m.text }] : m.text }))],
          ...(json ? { response_format: { type: "json_object" } } : {}),
        },
        cfg.apiKey,
      );
      const parsed = openAiChat.safeParse(raw);
      const text = parsed.success ? parsed.data.choices[0].message.content : null;
      if (!text) throw new ApiError(502, "El proveedor de IA no devolvió contenido");
      return { text, inputTokens: parsed.data?.usage?.prompt_tokens, outputTokens: parsed.data?.usage?.completion_tokens };
    },
    embed: embeddingModel
      ? async (texts) => {
          const url = `${await assertSafeBaseUrl(base)}/embeddings`;
          const out: number[][] = [];
          for (let i = 0; i < texts.length; i += EMBED_BATCH) {
            const batch = texts.slice(i, i + EMBED_BATCH);
            const raw = await postJson("OPENAI", url, headers, { model: embeddingModel, input: batch, dimensions: EMBED_DIM }, cfg.apiKey);
            const parsed = openAiEmbed.safeParse(raw);
            if (!parsed.success) throw new ApiError(502, "Respuesta de embeddings inesperada");
            const rows = [...parsed.data.data].sort((a, b) => (a.index ?? 0) - (b.index ?? 0));
            out.push(...checkVectors("OPENAI", rows.map((r) => r.embedding), batch.length));
          }
          return out;
        }
      : null,
  };
}

const anthropicMsg = z.object({
  content: z.array(z.object({ type: z.string(), text: z.string().optional() })),
  usage: z.object({ input_tokens: z.number().optional(), output_tokens: z.number().optional() }).optional(),
});

function anthropicClient(cfg: AiConfig, source: AiClient["source"]): AiClient {
  if (!cfg.apiKey) throw new ApiError(503, "Falta la clave de Anthropic");
  const key = cfg.apiKey;
  // Otra URL (pasarela propia o servidor de pruebas) solo si la autoriza la administración
  const custom = normalizeUrl(cfg.baseUrl);
  const base = custom && localBaseUrls().includes(custom) ? custom : ANTHROPIC_URL;
  return {
    provider: "ANTHROPIC",
    source,
    chatModel: cfg.model,
    embedTag: null,
    async text({ system, messages, temperature, json }) {
      const raw = await postJson(
        "ANTHROPIC",
        `${base}/messages`,
        { "x-api-key": key, "anthropic-version": ANTHROPIC_VERSION },
        {
          model: cfg.model,
          max_tokens: 8192,
          temperature: temperature ?? 0.3,
          system: json ? withSchema(system, json) : system,
          messages: messages.map((m) => ({ role: m.role, content: m.images?.length ? [...m.images.map((i) => ({ type: "image", source: { type: "base64", media_type: i.mime, data: i.base64 } })), { type: "text", text: m.text }] : m.text })),
        },
        key,
      );
      const parsed = anthropicMsg.safeParse(raw);
      const text = parsed.success ? parsed.data.content.filter((c) => c.type === "text").map((c) => c.text ?? "").join("") : "";
      if (!text) throw new ApiError(502, "Anthropic no devolvió contenido");
      return { text, inputTokens: parsed.data?.usage?.input_tokens, outputTokens: parsed.data?.usage?.output_tokens };
    },
    embed: null,
  };
}

/** Esperas (ms) ante una saturación o caída temporal del proveedor (503…) en una llamada de chat: se repite la misma petición. */
export const TRANSIENT_RETRY_WAITS_MS = [3_000, 8_000];

/**
 * Repite `text()` si el proveedor está saturado un momento («high demand», 503…). Los errores permanentes (clave rechazada, petición
 * mal formada) y el límite de cuota (429, que pide esperar más) no se repiten aquí: los trata quien llama.
 */
export function withTransientRetry(client: AiClient, sleep: (ms: number) => Promise<void> = (ms) => new Promise((r) => setTimeout(r, ms))): AiClient {
  const text = client.text.bind(client);
  return {
    ...client,
    async text(p) {
      for (let i = 0; ; i++) {
        try {
          return await text(p);
        } catch (e) {
          const overloaded = e instanceof ApiError && (e.details as { code?: string } | undefined)?.code === "ai_overloaded";
          if (!overloaded || i >= TRANSIENT_RETRY_WAITS_MS.length) throw e;
          await sleep(TRANSIENT_RETRY_WAITS_MS[i]);
        }
      }
    },
  };
}

export function buildClient(cfg: AiConfig, source: AiClient["source"] = "user"): AiClient {
  const client = cfg.provider === "GEMINI" ? geminiClient(cfg, source) : cfg.provider === "ANTHROPIC" ? anthropicClient(cfg, source) : openAiClient(cfg, source);
  return withTransientRetry(client);
}

// Selección por usuario ---------------------------------------------------------------------------

export function serverConfig(): AiConfig | null {
  const e = env();
  if (!e.GEMINI_API_KEY) return null;
  return { provider: "GEMINI", baseUrl: null, model: e.GEMINI_CHAT_MODEL, embeddingModel: e.GEMINI_EMBEDDING_MODEL, apiKey: e.GEMINI_API_KEY };
}

/** Configuración propia (con la clave descifrada) o null. Solo para uso interno del servidor. */
export async function userConfig(userId: string): Promise<AiConfig | null> {
  const c = await prisma.aiCredential.findUnique({ where: { userId } });
  if (!c) return null;
  return {
    provider: c.provider as AiProvider,
    baseUrl: c.baseUrl,
    model: c.model,
    embeddingModel: c.embeddingModel,
    apiKey: c.keySealed ? openJson<{ key: string }>(c.keySealed).key : null,
  };
}

/** IA que habría tocado sin servidor local: la propia del usuario o, si no tiene, la del servidor. */
async function resolveAi(userId: string): Promise<AiClient | null> {
  const own = await userConfig(userId);
  if (own) return buildClient(own, "user");
  const server = serverConfig();
  return server ? buildClient(server, "server") : null;
}

/**
 * Proveedor que se usará con los datos de `userId`. Si hay servidor de IA local (LOCAL_AI_BASE_URL) va primero,
 * incluso si el usuario tiene clave propia; si no responde, se usa lo de siempre (su IA o la Gemini del servidor).
 */
export async function aiFor(userId: string): Promise<AiClient> {
  const base = await resolveAi(userId);
  const local = localConfig();
  if (local) return localFirst(local, base);
  if (base) return base;
  throw new ApiError(503, "Configura tu IA en Ajustes → IA (tu propia clave de Google, OpenAI, Anthropic o un modelo local)", { code: "ai_not_configured" });
}

/** Si hay alguna IA disponible para ese usuario (sin descifrar nada). */
export async function aiAvailable(userId: string): Promise<boolean> {
  if (localConfig() || serverConfig()) return true;
  return Boolean(await prisma.aiCredential.findUnique({ where: { userId }, select: { id: true } }));
}

/** Nombre legible del proveedor que trata los datos (para avisos de privacidad). */
export function providerLabel(provider: AiProvider, baseUrl?: string | null): string {
  if (provider === "GEMINI") return "Google Gemini";
  if (provider === "ANTHROPIC") return "Anthropic (Claude)";
  const preset = Object.values(OPENAI_PRESETS).find((p) => p.baseUrl === baseUrl);
  if (preset) return preset.label;
  if (baseUrl && localBaseUrls().includes(normalizeUrl(baseUrl) ?? "")) return "modelo local de este servidor";
  return baseUrl ? new URL(baseUrl).host : "proveedor compatible con OpenAI";
}

/** JSON de un modelo que a veces lo envuelve en ```json … ```. */
export function extractJson(text: string): unknown {
  const t = text.trim();
  const fenced = t.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i)?.[1];
  const body = fenced ?? t;
  try {
    return JSON.parse(body);
  } catch {
    const start = body.indexOf("{");
    const end = body.lastIndexOf("}");
    if (start >= 0 && end > start) return JSON.parse(body.slice(start, end + 1));
    throw new Error("JSON inválido");
  }
}
