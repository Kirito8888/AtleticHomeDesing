import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { chunkByTokens, condenseText, createLimiter, estimateTokens, localChat, localChatStream, localFirst, localHealthy, resetLocalHealthCache, type LocalAiConfig } from "./local";
import type { AiClient } from "./provider";

const cfg: LocalAiConfig = { baseUrl: "http://ia.test:8080/v1", apiKey: "k-secreta-123", model: "qwen36", timeoutMs: 5_000 };
const ok = (body: unknown) => new Response(JSON.stringify(body), { status: 200 });
const chatOk = (content: string, extra: Record<string, unknown> = {}) => ok({ choices: [{ message: { content, ...extra } }], usage: { prompt_tokens: 3, completion_tokens: 5 } });
const fallback = (): AiClient => ({ provider: "GEMINI", source: "server", chatModel: "g", embedTag: "tag", embed: async () => [], text: vi.fn(async () => ({ text: "desde gemini" })) });
const call = { system: "s", messages: [{ role: "user" as const, text: "hola" }] };

let fetchMock: ReturnType<typeof vi.fn>;
beforeEach(() => {
  resetLocalHealthCache();
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => vi.unstubAllGlobals());

const routes = (health: () => Response | Promise<Response>, chat: () => Response | Promise<Response>) =>
  fetchMock.mockImplementation(async (url: string) => (String(url).endsWith("/health") ? health() : chat()));

describe("selección de proveedor", () => {
  it("health ok → usa el local", async () => {
    routes(() => ok({ status: "ok" }), () => chatOk("desde local"));
    const fb = fallback();
    const r = await localFirst(cfg, fb).text(call);
    expect(r.text).toBe("desde local");
    expect(fb.text).not.toHaveBeenCalled();
    expect(String(fetchMock.mock.calls[0][0])).toBe("http://ia.test:8080/health");
  });

  it("health falla → Gemini (sin llamar al chat local)", async () => {
    routes(() => { throw new Error("ECONNREFUSED"); }, () => chatOk("no debería"));
    const fb = fallback();
    expect((await localFirst(cfg, fb).text(call)).text).toBe("desde gemini");
    expect(fetchMock.mock.calls.some((c) => String(c[0]).includes("chat/completions"))).toBe(false);
  });

  it("health devuelve 503 (modelo cargando) → Gemini", async () => {
    routes(() => new Response("", { status: 503 }), () => chatOk("no"));
    expect((await localFirst(cfg, fallback()).text(call)).text).toBe("desde gemini");
  });

  it("el local falla a mitad (5xx) → reintenta una vez con Gemini", async () => {
    routes(() => ok({ status: "ok" }), () => new Response("boom", { status: 500 }));
    const fb = fallback();
    expect((await localFirst(cfg, fb).text(call)).text).toBe("desde gemini");
    expect(fb.text).toHaveBeenCalledTimes(1);
  });

  it("error de red a mitad → Gemini; respuesta vacía → Gemini", async () => {
    routes(() => ok({}), () => { throw new Error("reset"); });
    expect((await localFirst(cfg, fallback()).text(call)).text).toBe("desde gemini");
    resetLocalHealthCache();
    routes(() => ok({}), () => chatOk("  "));
    expect((await localFirst(cfg, fallback()).text(call)).text).toBe("desde gemini");
  });

  it("sin respaldo y con el local caído → 503", async () => {
    routes(() => { throw new Error("x"); }, () => chatOk("x"));
    await expect(localFirst(cfg, null).text(call)).rejects.toMatchObject({ status: 503 });
  });

  it("la clave se envía como Bearer y no aparece en los errores", async () => {
    routes(() => ok({}), () => new Response("clave k-secreta-123 mala", { status: 401 }));
    await expect(localChat(cfg, call)).rejects.toThrow(/•••/);
    expect((fetchMock.mock.calls[0][1] as RequestInit).headers).toMatchObject({ authorization: "Bearer k-secreta-123" });
  });
});

describe("cuerpo de la petición", () => {
  it("usa content y nunca reasoning_content", async () => {
    routes(() => ok({}), () => chatOk("respuesta final", { reasoning_content: "pensamiento interno" }));
    const r = await localChat(cfg, call);
    expect(r.text).toBe("respuesta final");
    expect(r.text).not.toContain("pensamiento");
    expect(r.outputTokens).toBe(5);
  });

  it("thinking apagado por defecto y encendido bajo petición; imágenes como data URL", async () => {
    routes(() => ok({}), () => chatOk("x"));
    await localChat(cfg, call);
    await localChat(cfg, { ...call, thinking: true, messages: [{ role: "user", text: "mira", images: [{ mime: "image/png", base64: "AAAA" }] }] });
    const [a, b] = fetchMock.mock.calls.map((c) => JSON.parse((c[1] as RequestInit).body as string));
    expect(a.chat_template_kwargs).toEqual({ enable_thinking: false });
    expect(b.chat_template_kwargs).toEqual({ enable_thinking: true });
    expect(b.messages[1].content[0].image_url.url).toBe("data:image/png;base64,AAAA");
  });

  it("rechaza imágenes de más de 5 MB (y entonces se usa el respaldo)", async () => {
    routes(() => ok({}), () => chatOk("x"));
    const big = { ...call, messages: [{ role: "user" as const, text: "a", images: [{ mime: "image/png" as const, base64: "A".repeat(7 * 1024 * 1024) }] }] };
    await expect(localChat(cfg, big)).rejects.toMatchObject({ status: 413 });
    expect((await localFirst(cfg, fallback()).text(big)).text).toBe("desde gemini");
  });
});

describe("limitador de concurrencia 1", () => {
  it("ejecuta de una en una y en orden", async () => {
    const lim = createLimiter(1);
    const order: string[] = [];
    let running = 0;
    let maxRunning = 0;
    const job = (name: string, ms: number) => lim.run(async () => {
      running++; maxRunning = Math.max(maxRunning, running); order.push(`+${name}`);
      await new Promise((r) => setTimeout(r, ms));
      order.push(`-${name}`); running--;
    });
    await Promise.all([job("a", 20), job("b", 5), job("c", 1)]);
    expect(maxRunning).toBe(1);
    expect(order).toEqual(["+a", "-a", "+b", "-b", "+c", "-c"]);
  });

  it("libera el hueco si la tarea falla", async () => {
    const lim = createLimiter(1);
    await expect(lim.run(async () => { throw new Error("x"); })).rejects.toThrow();
    expect(await lim.run(async () => 7)).toBe(7);
  });
});

describe("troceado por tokens", () => {
  it("cada trozo respeta el tope y no se pierde texto", () => {
    const text = Array.from({ length: 400 }, (_, i) => `Párrafo ${i} ${"palabra ".repeat(30)}`).join("\n\n");
    const parts = chunkByTokens(text, 1_000);
    expect(parts.length).toBeGreaterThan(1);
    for (const p of parts) expect(estimateTokens(p)).toBeLessThanOrEqual(1_000);
    expect(parts.join("")).toBe(text);
  });

  it("texto sin separadores también se corta", () => {
    expect(chunkByTokens("x".repeat(10_000), 1_000).map((p) => p.length)).toEqual([4_000, 4_000, 2_000]);
  });

  it("condenseText resume por trozos y luego los resúmenes; un texto corto no se toca", async () => {
    const summarize = vi.fn(async (c: string) => c.slice(0, Math.ceil(c.length / 10)));
    const long = "palabra ".repeat(60_000); // ~120k tokens
    const out = await condenseText(long, summarize, 48_000);
    expect(estimateTokens(out)).toBeLessThanOrEqual(48_000);
    expect(summarize.mock.calls.length).toBeGreaterThanOrEqual(4);
    const spy = vi.fn();
    expect(await condenseText("corto", spy)).toBe("corto");
    expect(spy).not.toHaveBeenCalled();
  });

  it("condenseText se detiene si el modelo no reduce", async () => {
    const out = await condenseText("x".repeat(400_000), async (c) => c);
    expect(out.length).toBe(400_000);
  });
});

describe("salud y streaming", () => {
  it("cachea unos segundos y respeta el timeout de 1,5 s", async () => {
    routes(() => ok({}), () => chatOk("x"));
    await localHealthy(cfg, 1_000);
    await localHealthy(cfg, 2_000);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await localHealthy(cfg, 9_000);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect((fetchMock.mock.calls[0][1] as RequestInit).signal).toBeInstanceOf(AbortSignal);
  });

  it("el streaming emite solo content y libera la cola", async () => {
    const sse = ['data: {"choices":[{"delta":{"reasoning_content":"pienso"}}]}', 'data: {"choices":[{"delta":{"content":"Ho"}}]}', 'data: {"choices":[{"delta":{"content":"la"}}]}', 'data: {"choices":[],"usage":{"completion_tokens":2}}', "data: [DONE]", ""].join("\n\n");
    fetchMock.mockResolvedValue(new Response(sse, { status: 200 }));
    const lim = createLimiter(1);
    let out = "";
    for await (const d of localChatStream(cfg, call, lim)) out += d;
    expect(out).toBe("Hola");
    expect(await lim.run(async () => "libre")).toBe("libre");
  });
});
