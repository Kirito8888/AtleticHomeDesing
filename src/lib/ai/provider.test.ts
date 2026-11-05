import { afterEach, describe, expect, it, vi } from "vitest";

import { ApiError } from "@/lib/api";

import { resetLocalHealthCache } from "./local";
import { aiAvailable, aiFor, assertExternalAiAllowed, buildClient, resetAiClientCache, TRANSIENT_FAST_MS, providerLabel, extractJson, readGeminiResponse, isPrivateAddress, normalizeUrl, providerError, TRANSIENT_RETRY_WAITS_MS, withTransientRetry, type AiClient } from "./provider";

const findUnique = vi.hoisted(() => vi.fn());
vi.mock("@/lib/prisma", () => ({ prisma: { aiCredential: { findUnique } } }));
// Entorno mínimo y mutable (el test no depende de .env.local)
const e = vi.hoisted(() => ({
  LOCAL_AI_ONLY: false as boolean,
  LOCAL_AI_BASE_URL: undefined as string | undefined,
  LOCAL_AI_KEY: undefined,
  LOCAL_AI_MODEL: "qwen36",
  LOCAL_AI_TIMEOUT_MS: 5_000,
  GEMINI_API_KEY: undefined as string | undefined,
  GEMINI_CHAT_MODEL: "gemini-2.5-flash",
  GEMINI_EMBEDDING_MODEL: "gemini-embedding-001",
  AI_LOCAL_BASE_URLS: undefined,
}));
vi.mock("@/lib/env", async (orig) => ({ ...(await orig<typeof import("@/lib/env")>()), env: () => e }));

describe("L1 · LOCAL_AI_ONLY", () => {
  const prev = { only: e.LOCAL_AI_ONLY, url: e.LOCAL_AI_BASE_URL, gemini: e.GEMINI_API_KEY };
  const fetchMock = vi.fn();
  const set = (only: boolean, url: string | undefined) => {
    e.LOCAL_AI_ONLY = only;
    e.LOCAL_AI_BASE_URL = url;
    e.GEMINI_API_KEY = "AIzaSy-clave-del-servidor-de-prueba"; // y además hay credencial guardada (findUnique)
    findUnique.mockReset().mockResolvedValue({ id: "c1", provider: "GEMINI", baseUrl: null, model: "gemini-2.5-flash", embeddingModel: "gemini-embedding-001", keySealed: null });
    resetLocalHealthCache();
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  };
  afterEach(() => {
    Object.assign(e, { LOCAL_AI_ONLY: prev.only, LOCAL_AI_BASE_URL: prev.url, GEMINI_API_KEY: prev.gemini });
    resetLocalHealthCache();
    vi.unstubAllGlobals();
  });

  it("aiFor no lee la credencial guardada, no tiene embeddings y solo habla con el local", async () => {
    set(true, "http://ia.test:8080/v1");
    fetchMock.mockImplementation(async (url: string) => (String(url).endsWith("/health") ? new Response("{}") : new Response(JSON.stringify({ choices: [{ message: { content: "local" } }] }))));
    const ai = await aiFor("u1");
    expect(findUnique).not.toHaveBeenCalled();
    expect(ai.embed).toBeNull();
    expect(ai.embedTag).toBeNull();
    expect((await ai.text({ system: "s", messages: [{ role: "user", text: "hola" }] })).text).toBe("local");
    expect(fetchMock.mock.calls.length).toBeGreaterThan(0);
    expect(fetchMock.mock.calls.every((c) => String(c[0]).startsWith("http://ia.test:8080/"))).toBe(true);
  });

  it("local apagado → 503 claro, sin tocar Gemini", async () => {
    set(true, "http://ia.test:8080/v1");
    fetchMock.mockRejectedValue(new Error("ECONNREFUSED"));
    const ai = await aiFor("u1");
    await expect(ai.text({ system: "s", messages: [{ role: "user", text: "hola" }] })).rejects.toMatchObject({ status: 503, details: { code: "ai_local_down" } });
    expect(fetchMock.mock.calls.every((c) => String(c[0]).startsWith("http://ia.test:8080/"))).toBe(true);
  });

  it("sin LOCAL_AI_BASE_URL → 503 y aiAvailable false (aunque haya Gemini y credencial)", async () => {
    set(true, undefined);
    await expect(aiFor("u1")).rejects.toMatchObject({ status: 503, details: { code: "ai_not_configured" } });
    expect(await aiAvailable("u1")).toBe(false);
    expect(findUnique).not.toHaveBeenCalled();
    set(true, "http://ia.test:8080/v1");
    expect(await aiAvailable("u1")).toBe(true);
  });

  it("IA externa bloqueada (403) y la etiqueta de una clave guardada avisa de que no se usa", () => {
    set(true, "http://ia.test:8080/v1");
    expect(() => assertExternalAiAllowed()).toThrow(expect.objectContaining({ status: 403 }));
    expect(providerLabel("GEMINI")).toBe("Google Gemini (guardada, sin uso: solo IA local)");
  });

  it("con la variable a false, todo como antes: el respaldo (credencial guardada) sigue disponible", async () => {
    set(false, "http://ia.test:8080/v1");
    findUnique.mockResolvedValue({ id: "c1", provider: "OPENAI", baseUrl: "https://api.openai.com/v1", model: "m", embeddingModel: "text-embedding-3-small", keySealed: null });
    expect(() => assertExternalAiAllowed()).not.toThrow();
    expect(providerLabel("GEMINI")).toBe("Google Gemini");
    const ai = await aiFor("u1");
    expect(findUnique).toHaveBeenCalled();
    expect(ai.embedTag).toBe("openai:api.openai.com:text-embedding-3-small@768"); // hereda los embeddings del respaldo
  });
});

describe("URL de proveedores (SSRF)", () => {
  it("rechaza direcciones internas, locales y reservadas", () => {
    for (const ip of ["127.0.0.1", "10.1.2.3", "172.16.0.1", "172.31.255.1", "192.168.1.10", "169.254.169.254", "100.64.0.1", "0.0.0.0", "::1", "fd00::1", "fe80::1", "::ffff:127.0.0.1", "224.0.0.1"]) {
      expect(isPrivateAddress(ip), ip).toBe(true);
    }
    for (const ip of ["8.8.8.8", "172.32.0.1", "2606:4700::1111", "104.18.1.1"]) expect(isPrivateAddress(ip), ip).toBe(false);
    expect(isPrivateAddress("no-es-ip")).toBe(true);
  });

  it("normaliza la URL y descarta credenciales, consulta o fragmento", () => {
    expect(normalizeUrl("https://api.openai.com/v1/")).toBe("https://api.openai.com/v1");
    expect(normalizeUrl(" http://ollama:11434/v1 ")).toBe("http://ollama:11434/v1");
    expect(normalizeUrl("https://user:pw@x.dev/v1")).toBeNull();
    expect(normalizeUrl("https://x.dev/v1?a=1")).toBeNull();
    expect(normalizeUrl("no es url")).toBeNull();
    expect(normalizeUrl("")).toBeNull();
  });
});

describe("errores del proveedor", () => {
  it("nunca repiten la clave", () => {
    const key = "sk-proj-ABCDEFGHIJKLMNOPQRSTUVWX1234";
    const e = providerError("OPENAI", 400, `Incorrect API key provided: ${key}. Otra: AIzaSyD-abcdefghijklmnop`, key);
    expect(e.message).not.toContain(key);
    expect(e.message).not.toContain("AIzaSyD-abcdefghijklmnop");
    expect(e.message).toContain("•••");
  });

  it("401/403 → clave rechazada; 429 → límite", () => {
    expect(providerError("ANTHROPIC", 401, "x", "k").message).toMatch(/rechaza la clave/);
    expect(providerError("GEMINI", 429, "x", "k").status).toBe(429);
  });
});

describe("JSON de los modelos", () => {
  it("acepta JSON limpio, entre ``` o con texto alrededor", () => {
    expect(extractJson('{"a":1}')).toEqual({ a: 1 });
    expect(extractJson('```json\n{"a":2}\n```')).toEqual({ a: 2 });
    expect(extractJson('Aquí tienes: {"a":3} ¡suerte!')).toEqual({ a: 3 });
    expect(() => extractJson("nada")).toThrow();
  });
});

describe("withTransientRetry (saturación temporal del proveedor)", () => {
  const base = (text: AiClient["text"]): AiClient => ({ provider: "GEMINI", source: "server", chatModel: "m", embedTag: null, text, embed: null });
  const overloaded = () => providerError("GEMINI", 503, "This model is currently experiencing high demand", null);

  it("un 503 se espera y se repite hasta que responde", async () => {
    const waits: number[] = [];
    let n = 0;
    const c = withTransientRetry(
      base(async () => {
        if (++n <= 2) throw overloaded();
        return { text: "ok" };
      }),
      async (ms) => void waits.push(ms),
    );
    expect(await c.text({ system: "", messages: [] })).toEqual({ text: "ok" });
    expect(n).toBe(3);
    expect(waits).toEqual(TRANSIENT_RETRY_WAITS_MS);
  });
  it("si sigue saturado tras las esperas, lanza el error original", async () => {
    let n = 0;
    const c = withTransientRetry(
      base(async () => {
        n++;
        throw overloaded();
      }),
      async () => {},
    );
    await expect(c.text({ system: "", messages: [] })).rejects.toMatchObject({ status: 502 });
    expect(n).toBe(TRANSIENT_RETRY_WAITS_MS.length + 1);
  });
  it("la clave rechazada, el 429 y los errores de petición no se repiten", async () => {
    for (const err of [providerError("GEMINI", 403, "x", null), providerError("GEMINI", 429, "x", null), providerError("GEMINI", 400, "x", null), new ApiError(400, "mal")]) {
      let n = 0;
      const c = withTransientRetry(
        base(async () => {
          n++;
          throw err;
        }),
        async () => {},
      );
      await expect(c.text({ system: "", messages: [] })).rejects.toBe(err);
      expect(n).toBe(1);
    }
  });
});

describe("readGeminiResponse (respuestas vacías de Gemini)", () => {
  const usage = { promptTokenCount: 10, candidatesTokenCount: 20, thoughtsTokenCount: 5 };
  it("respuesta normal: texto y tokens de salida con los de «pensar»", () => {
    expect(readGeminiResponse({ text: "{}", candidates: [{ finishReason: "STOP" }], usageMetadata: usage })).toEqual({ text: "{}", inputTokens: 10, outputTokens: 25 });
  });
  it.each(["RECITATION", "SAFETY", "PROHIBITED_CONTENT"])("vacía por %s: ApiError ai_empty con el motivo", (reason) => {
    try {
      readGeminiResponse({ candidates: [{ finishReason: reason }], usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 0 } });
      throw new Error("debía lanzar");
    } catch (e) {
      expect((e as { status: number }).status).toBe(502);
      expect((e as { details: unknown }).details).toEqual({ code: "ai_empty", reason });
    }
  });
  it("bloqueo del prompt (promptFeedback) sin candidatos", () => {
    expect(() => readGeminiResponse({ promptFeedback: { blockReason: "SAFETY" } })).toThrow(/no devolvió contenido/);
  });
  it("MAX_TOKENS con JSON a medias no se devuelve como bueno", () => {
    expect(() => readGeminiResponse({ text: '{"a":[1,', candidates: [{ finishReason: "MAX_TOKENS" }] })).toThrow(/límite de salida/);
  });
});

describe("B1 · timeout, SDK que no responde y cliente reutilizado", () => {
  /** fetch que nunca responde: solo termina cuando se aborta su señal (como una red colgada). */
  const hang = () => {
    const calls: string[] = [];
    const fn = ((url: unknown, init?: RequestInit) => {
      calls.push(String(url));
      return new Promise<Response>((_, reject) => {
        const sig = init?.signal;
        const abort = () => reject(Object.assign(new Error("aborted"), { name: "AbortError" }));
        if (sig?.aborted) abort();
        else sig?.addEventListener("abort", abort);
      });
    }) as unknown as typeof fetch;
    return { fn, calls };
  };
  const gemini = { provider: "GEMINI" as const, baseUrl: null, model: "gemini-2.5-flash", embeddingModel: "gemini-embedding-001", apiKey: "AIzaSy-prueba-b1" };
  const openai = { provider: "OPENAI" as const, baseUrl: "https://api.openai.com/v1", model: "m", embeddingModel: "text-embedding-3-small", apiKey: "sk-prueba-b1" };

  it("Gemini: chat y embeddings se cortan a tiempo, con ai_timeout y sin repetir", async () => {
    for (const run of [(c: AiClient) => c.text({ system: "s", messages: [{ role: "user", text: "hola" }] }), (c: AiClient) => c.embed!(["hola"], "RETRIEVAL_QUERY")]) {
      const h = hang();
      const c = buildClient(gemini, "user", { timeoutMs: 50, fetch: h.fn });
      const t0 = Date.now();
      await expect(run(c)).rejects.toMatchObject({ status: 504, details: { code: "ai_timeout" } });
      expect(Date.now() - t0).toBeLessThan(2_000);
      expect(h.calls).toHaveLength(1); // ni el SDK ni withTransientRetry repiten
    }
  });

  it("OpenAI compatible: chat y embeddings se cortan a tiempo y sin repetir", async () => {
    for (const run of [(c: AiClient) => c.text({ system: "s", messages: [{ role: "user", text: "hola" }] }), (c: AiClient) => c.embed!(["hola"], "RETRIEVAL_QUERY")]) {
      const h = hang();
      const c = buildClient(openai, "user", { timeoutMs: 50, fetch: h.fn });
      await expect(run(c)).rejects.toMatchObject({ status: 504, details: { code: "ai_timeout" } });
      expect(h.calls).toHaveLength(1);
    }
  });

  it("withTransientRetry: un 503 lento (≥ TRANSIENT_FAST_MS) no se repite", async () => {
    let clock = 0;
    let n = 0;
    const base: AiClient = {
      provider: "GEMINI", source: "server", chatModel: "m", embedTag: null, embed: null,
      async text() { n++; clock += TRANSIENT_FAST_MS; throw providerError("GEMINI", 503, "alta demanda", null); },
    };
    await expect(withTransientRetry(base, async () => {}, () => clock).text({ system: "", messages: [] })).rejects.toMatchObject({ status: 502 });
    expect(n).toBe(1);
  });

  it("el cliente se reutiliza por configuración y se renueva al cambiarla o vaciar la caché", () => {
    resetAiClientCache();
    const a = buildClient(gemini, "user");
    expect(buildClient({ ...gemini }, "user")).toBe(a);
    expect(buildClient({ ...gemini, apiKey: "AIzaSy-otra-b1" }, "user")).not.toBe(a);
    expect(buildClient(gemini, "server")).not.toBe(a);
    expect(buildClient(gemini, "user", { timeoutMs: 50 })).not.toBe(a); // con opciones: fuera de la caché
    resetAiClientCache();
    expect(buildClient(gemini, "user")).not.toBe(a);
  });
});
