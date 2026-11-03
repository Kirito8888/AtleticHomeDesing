import { describe, expect, it } from "vitest";

import { ApiError } from "@/lib/api";

import { extractJson, readGeminiResponse, isPrivateAddress, normalizeUrl, providerError, TRANSIENT_RETRY_WAITS_MS, withTransientRetry, type AiClient } from "./provider";

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
