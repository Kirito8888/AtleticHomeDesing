// Integración (v1.9): IA propia de cada usuario contra un servidor simulado compatible con OpenAI y
// con la API de Anthropic. Comprueba que la clave va cifrada, no sale en la vista ni en la exportación,
// que el consentimiento se retira al cambiar de proveedor y que los datos van al proveedor del usuario.
import { randomBytes } from "node:crypto";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";

import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { z } from "zod";

vi.mock("@/auth", () => ({ auth: async () => null }));
vi.mock("@/lib/jobs/queue", () => ({ enqueueIngest: async () => undefined }));

const HAS_DB = Boolean(process.env.DATABASE_URL);
const OPENAI_KEY = "sk-test-openai-0123456789abcdefWXYZ";
const ANTHROPIC_KEY = "sk-ant-test-0123456789abcdefQRST";

type Seen = { path: string; auth: string | null; body: Record<string, unknown> };

describe.skipIf(!HAS_DB)("IA propia por usuario (BD real y proveedor simulado)", () => {
  let prisma: typeof import("@/lib/prisma").prisma;
  let creds: typeof import("./credentials");
  let llm: typeof import("./llm");
  let account: typeof import("@/lib/account/service");
  let server: Server;
  let base: string;
  let userId: string;
  const seen: Seen[] = [];
  const t = Date.now();

  beforeAll(async () => {
    server = createServer((req, res) => {
      let raw = "";
      req.on("data", (c) => (raw += c));
      req.on("end", () => {
        const body = JSON.parse(raw || "{}") as Record<string, unknown>;
        seen.push({ path: req.url ?? "", auth: (req.headers.authorization as string) ?? (req.headers["x-api-key"] as string) ?? null, body });
        const ok = req.headers.authorization === `Bearer ${OPENAI_KEY}` || req.headers["x-api-key"] === ANTHROPIC_KEY;
        res.setHeader("content-type", "application/json");
        if (!ok) {
          res.statusCode = 401;
          return res.end(JSON.stringify({ error: { message: `Incorrect API key provided: ${req.headers.authorization}` } }));
        }
        if (req.url?.endsWith("/embeddings")) {
          const input = body.input as string[];
          return res.end(JSON.stringify({ data: input.map((_, i) => ({ index: i, embedding: Array.from({ length: Number(body.model === "mini-384" ? 384 : 768) }, (_, j) => (j === i ? 1 : 0)) })) }));
        }
        const wantsJson = JSON.stringify(body).includes("objeto JSON");
        const text = wantsJson ? '```json\n{"respuesta":"vale"}\n```' : "OK";
        if (req.url?.endsWith("/messages")) return res.end(JSON.stringify({ content: [{ type: "text", text }], usage: { input_tokens: 3, output_tokens: 1 } }));
        return res.end(JSON.stringify({ choices: [{ message: { content: text } }], usage: { prompt_tokens: 3, completion_tokens: 1 } }));
      });
    });
    await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/v1`;
    process.env.AI_LOCAL_BASE_URLS = base;
    process.env.DATA_ENCRYPTION_KEY = randomBytes(32).toString("base64");
    delete process.env.GEMINI_API_KEY;
    vi.resetModules();
    prisma = (await import("@/lib/prisma")).prisma;
    creds = await import("./credentials");
    llm = await import("./llm");
    account = await import("@/lib/account/service");
    userId = (await prisma.user.create({ data: { email: `ia-${t}@test.dev`, aiConsentAt: new Date() } })).id;
  });
  afterAll(async () => {
    await prisma.user.deleteMany({ where: { email: { contains: `-${t}@test.dev` } } });
    server.close();
  });

  it("sin IA propia ni clave del servidor: 503 con el aviso de configurarla", async () => {
    await expect(llm.generateText({ userId, system: "s", messages: [{ role: "user", text: "hola" }] })).rejects.toMatchObject({ status: 503 });
  });

  it("clave incorrecta: no se guarda nada y el error no repite la clave", async () => {
    const wrong = "sk-wrong-key-should-not-leak-123456";
    const err = await creds.saveCredential(userId, { provider: "OPENAI", baseUrl: base, model: "m", embeddingModel: null, apiKey: wrong }).catch((e: Error) => e);
    expect(err).toBeInstanceOf(Error);
    expect((err as Error).message).not.toContain(wrong);
    expect(await prisma.aiCredential.findUnique({ where: { userId } })).toBeNull();
  });

  it("compatible con OpenAI (modelo local autorizado): se prueba, se guarda cifrada y la vista no la muestra", async () => {
    const r = await creds.saveCredential(userId, { provider: "OPENAI", baseUrl: base, model: "llama", embeddingModel: "nomic", apiKey: OPENAI_KEY });
    expect(r.label).toBe("modelo local de este servidor");
    expect(r.consentReset).toBe(true); // proveedor nuevo → hay que volver a autorizar
    const row = await prisma.aiCredential.findUniqueOrThrow({ where: { userId } });
    expect(row.keySealed).not.toContain(OPENAI_KEY);
    expect(row.keyHint).toBe("WXYZ");
    const view = await creds.credentialView(userId);
    expect(JSON.stringify(view)).not.toContain(OPENAI_KEY);
    expect(JSON.stringify(view)).not.toContain(row.keySealed!);
    const exported = await account.exportAccount(userId);
    expect(JSON.stringify(exported)).not.toContain(OPENAI_KEY);
    expect(JSON.stringify(exported)).not.toContain(row.keySealed!);
    expect(exported.privacy.aiProvider?.model).toBe("llama");
  });

  it("los datos van al proveedor del usuario, con su clave; JSON y embeddings de 768", async () => {
    seen.length = 0;
    const json = await llm.generateJson(z.object({ respuesta: z.string() }), { userId, system: "Eres útil.", prompt: "¿vale?" });
    expect(json.data.respuesta).toBe("vale");
    const e = await llm.embedTexts(userId, ["uno", "dos"], "RETRIEVAL_DOCUMENT");
    expect(e?.vectors).toHaveLength(2);
    expect(e?.vectors[0]).toHaveLength(768);
    expect(e?.tag).toMatch(/^openai:127\.0\.0\.1:\d+:nomic@768$/);
    expect(seen.map((s) => s.path)).toEqual(["/v1/chat/completions", "/v1/embeddings"]);
    expect(seen.every((s) => s.auth === `Bearer ${OPENAI_KEY}`)).toBe(true);
    expect(seen[1].body.dimensions).toBe(768);
  });

  it("un modelo de embeddings con otra dimensión no se acepta", async () => {
    await expect(creds.saveCredential(userId, { provider: "OPENAI", baseUrl: base, model: "llama", embeddingModel: "mini-384", apiKey: null })).rejects.toMatchObject({ status: 422 });
    // Se conserva la configuración anterior
    expect((await prisma.aiCredential.findUniqueOrThrow({ where: { userId } })).embeddingModel).toBe("nomic");
  });

  it("cambiar solo el modelo conserva la clave y el consentimiento", async () => {
    await prisma.user.update({ where: { id: userId }, data: { aiConsentAt: new Date() } });
    const r = await creds.saveCredential(userId, { provider: "OPENAI", baseUrl: base, model: "llama-2", embeddingModel: "nomic", apiKey: null });
    expect(r.consentReset).toBe(false);
    expect((await prisma.user.findUniqueOrThrow({ where: { id: userId } })).aiConsentAt).not.toBeNull();
    expect((await creds.testSaved(userId)).ok).toBe(true);
  });

  it("Anthropic: otra API, sin embeddings (apuntes por texto); la clave anterior no se reutiliza en otro proveedor", async () => {
    await expect(creds.saveCredential(userId, { provider: "ANTHROPIC", baseUrl: base, model: "claude", embeddingModel: null, apiKey: null })).rejects.toMatchObject({ status: 400 });
    const r = await creds.saveCredential(userId, { provider: "ANTHROPIC", baseUrl: base, model: "claude", embeddingModel: null, apiKey: ANTHROPIC_KEY });
    expect(r.consentReset).toBe(true);
    seen.length = 0;
    const out = await llm.generateText({ userId, system: "s", messages: [{ role: "user", text: "hola" }] });
    expect(out.text).toBe("OK");
    expect(seen[0].path).toBe("/v1/messages");
    expect(seen[0].auth).toBe(ANTHROPIC_KEY);
    expect(await llm.embedTexts(userId, ["x"], "RETRIEVAL_QUERY")).toBeNull();
  });

  it("URL no autorizadas: http, redes internas y Anthropic fuera de la oficial", async () => {
    await expect(creds.saveCredential(userId, { provider: "OPENAI", baseUrl: "http://example.com/v1", model: "m", embeddingModel: null, apiKey: "k" })).rejects.toMatchObject({ status: 400 });
    await expect(creds.saveCredential(userId, { provider: "OPENAI", baseUrl: "https://127.0.0.1:9/v1", model: "m", embeddingModel: null, apiKey: "k" })).rejects.toMatchObject({ status: 400 });
    await expect(creds.saveCredential(userId, { provider: "OPENAI", baseUrl: "https://169.254.169.254/latest", model: "m", embeddingModel: null, apiKey: "k" })).rejects.toMatchObject({ status: 400 });
    await expect(creds.saveCredential(userId, { provider: "ANTHROPIC", baseUrl: "https://evil.example/v1", model: "m", embeddingModel: null, apiKey: "k" })).rejects.toMatchObject({ status: 400 });
  });

  it("quitar la IA propia borra la clave y retira el consentimiento", async () => {
    await prisma.user.update({ where: { id: userId }, data: { aiConsentAt: new Date() } });
    const r = await creds.deleteCredential(userId);
    expect(r).toMatchObject({ removed: true, consentReset: true });
    expect(await prisma.aiCredential.findUnique({ where: { userId } })).toBeNull();
    expect((await prisma.user.findUniqueOrThrow({ where: { id: userId } })).aiConsentAt).toBeNull();
  });

  it("una cuenta de demostración no puede configurar una IA propia", async () => {
    const demo = await prisma.user.create({ data: { email: `demo-${t}@test.dev`, demoExpiresAt: new Date(Date.now() + 864e5) } });
    await expect(creds.saveCredential(demo.id, { provider: "OPENAI", baseUrl: base, model: "m", embeddingModel: null, apiKey: OPENAI_KEY })).rejects.toMatchObject({ status: 403 });
  });
});
