import { randomBytes } from "node:crypto";

import sharp from "sharp";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

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

  it("L1 · solo local: sin embeddings ni respaldo aunque existan; health ok usa el local", async () => {
    routes(() => ok({}), () => chatOk("desde local"));
    const fb = fallback();
    const c = localFirst(cfg, fb, undefined, { only: true });
    expect(c.embed).toBeNull();
    expect(c.embedTag).toBeNull();
    expect((await c.text(call)).text).toBe("desde local");
    expect(fb.text).not.toHaveBeenCalled();
  });

  it("L1 · solo local y apagado → 503 ai_local_down, sin respaldo ni chat", async () => {
    routes(() => { throw new Error("ECONNREFUSED"); }, () => chatOk("no"));
    const fb = fallback();
    await expect(localFirst(cfg, fb, undefined, { only: true }).text(call)).rejects.toMatchObject({ status: 503, details: { code: "ai_local_down" }, message: expect.stringMatching(/no responde/) });
    expect(fb.text).not.toHaveBeenCalled();
    expect(fetchMock.mock.calls.every((c) => String(c[0]).startsWith("http://ia.test:8080/"))).toBe(true);
  });

  it("L1 · solo local y fallo a mitad → error del local, nunca el respaldo", async () => {
    routes(() => ok({}), () => new Response("boom", { status: 500 }));
    const fb = fallback();
    await expect(localFirst(cfg, fb, undefined, { only: true }).text(call)).rejects.toMatchObject({ status: 502, details: { code: "ai_local_failed" } });
    expect(fb.text).not.toHaveBeenCalled();
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

  it("L4 · imagen ≤ 5 MB no se toca", async () => {
    routes(() => ok({}), () => chatOk("x"));
    await localChat(cfg, { ...call, messages: [{ role: "user", text: "a", images: [{ mime: "image/png", base64: "AAAA" }] }] });
    const body = JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string);
    expect(body.messages[1].content[0].image_url.url).toBe("data:image/png;base64,AAAA");
  });
});

describe("L4 · imágenes de más de 5 MB", () => {
  const W = 2600;
  const H = 1100;
  let bigPng: Buffer;
  beforeAll(async () => {
    bigPng = await sharp(randomBytes(W * H * 3), { raw: { width: W, height: H, channels: 3 } }).png({ compressionLevel: 0 }).toBuffer();
  }, 30_000);
  const withImage = (b: Buffer, mime: "image/png" | "image/jpeg" = "image/png") => ({ ...call, messages: [{ role: "user" as const, text: "mira", images: [{ mime, base64: b.toString("base64") }] }] });
  const sentImage = () => {
    const body = JSON.parse((fetchMock.mock.calls.find((c) => String(c[0]).includes("chat/completions"))![1] as RequestInit).body as string);
    const url: string = body.messages[1].content[0].image_url.url;
    return { url, bytes: Buffer.from(url.split(",")[1], "base64") };
  };

  it("el fixture supera los 5 MB", () => {
    expect(bigPng.length).toBeGreaterThan(5 * 1024 * 1024);
  });

  it("se redimensiona a JPEG ≤ 2048 px y ~2 MB, con la misma proporción", async () => {
    routes(() => ok({}), () => chatOk("ok"));
    await localChat(cfg, withImage(bigPng));
    const { url, bytes } = sentImage();
    expect(url.startsWith("data:image/jpeg;base64,")).toBe(true);
    expect(bytes.length).toBeLessThanOrEqual(2 * 1024 * 1024);
    const m = await sharp(bytes).metadata();
    expect(m.format).toBe("jpeg");
    expect(Math.max(m.width!, m.height!)).toBeLessThanOrEqual(2048);
    expect(Math.abs(m.width! / m.height! - W / H)).toBeLessThan(0.01);
  }, 30_000);

  it("con el local sano responde el local y no se llama al respaldo", async () => {
    routes(() => ok({ status: "ok" }), () => chatOk("desde local"));
    const fb = fallback();
    expect((await localFirst(cfg, fb).text(withImage(bigPng))).text).toBe("desde local");
    expect(fb.text).not.toHaveBeenCalled();
  }, 30_000);

  it("buffer > 5 MB que no es imagen → 422 controlado, sin llamar al chat", async () => {
    routes(() => ok({}), () => chatOk("no"));
    await expect(localChat(cfg, withImage(randomBytes(6 * 1024 * 1024)))).rejects.toMatchObject({ status: 422, details: { code: "ai_local_image_invalid" } });
    expect(fetchMock.mock.calls.some((c) => String(c[0]).includes("chat/completions"))).toBe(false);
  });

  it("imagen no procesable: localFirst no usa el respaldo (con o sin only)", async () => {
    routes(() => ok({ status: "ok" }), () => chatOk("no"));
    const junk = withImage(randomBytes(6 * 1024 * 1024));
    const fb = fallback();
    await expect(localFirst(cfg, fb).text(junk)).rejects.toMatchObject({ status: 422 });
    await expect(localFirst(cfg, fb, undefined, { only: true }).text(junk)).rejects.toMatchObject({ status: 422 });
    expect(fb.text).not.toHaveBeenCalled();
  });

  it("el streaming rechaza la imagen inválida con 422 y libera la cola", async () => {
    const limiter = createLimiter(1);
    const gen = localChatStream(cfg, withImage(randomBytes(6 * 1024 * 1024)), limiter);
    await expect(gen.next()).rejects.toMatchObject({ status: 422 });
    await expect(limiter.run(async () => "libre")).resolves.toBe("libre");
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
