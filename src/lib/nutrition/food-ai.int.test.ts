// Integración (v1.10): foto de la comida y plan semanal con la IA del usuario (proveedor simulado
// compatible con OpenAI). La imagen va como image_url y el plan solo admite recetas del usuario.
import { randomBytes } from "node:crypto";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";

import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("@/auth", () => ({ auth: async () => null }));
vi.mock("@/lib/jobs/queue", () => ({ enqueueIngest: async () => undefined }));

const HAS_DB = Boolean(process.env.DATABASE_URL);
const KEY = "sk-test-food-0123456789abcdefWXYZ";

describe.skipIf(!HAS_DB)("IA en Nutrición v1.10 (BD real, proveedor simulado)", () => {
  let prisma: typeof import("@/lib/prisma").prisma;
  let ai: typeof import("./food-ai");
  let server: Server;
  let base: string;
  let userId: string;
  let reply = "{}";
  const bodies: Array<Record<string, unknown>> = [];
  const t = Date.now();

  beforeAll(async () => {
    server = createServer((req, res) => {
      let raw = "";
      req.on("data", (c) => (raw += c));
      req.on("end", () => {
        bodies.push(JSON.parse(raw || "{}"));
        res.setHeader("content-type", "application/json");
        res.end(JSON.stringify({ choices: [{ message: { content: req.url?.endsWith("/chat/completions") ? reply : "" } }] }));
      });
    });
    await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/v1`;
    process.env.AI_LOCAL_BASE_URLS = base;
    process.env.DATA_ENCRYPTION_KEY = randomBytes(32).toString("base64");
    delete process.env.LIFEOS_FAKE_AI;
    vi.resetModules();
    prisma = (await import("@/lib/prisma")).prisma;
    ai = await import("./food-ai");
    const { sealJson } = await import("@/lib/security/data-key");
    userId = (await prisma.user.create({ data: { email: `food-${t}@test.dev`, aiConsentAt: new Date() } })).id;
    await prisma.aiCredential.create({ data: { userId, provider: "OPENAI", baseUrl: base, model: "vision", keySealed: sealJson({ key: KEY }), keyHint: "WXYZ" } });
    await prisma.foodProduct.create({ data: { name: `Arroz blanco cocido zzfood${t}`, kcalPer100g: 130, proteinPer100g: 2.7, carbsPer100g: 28, fatPer100g: 0.3, ownerId: userId, source: "own" } });
    const item = (name: string, kcal100: number) => ({ name, grams: 100, kcal100, protein100: 10, carbs100: 10, fat100: 5 });
    for (const [n, k] of [["Lentejas", 120], ["Pasta con atún", 180], ["Pollo al horno", 150]] as const) await prisma.recipe.create({ data: { userId, name: n, servings: 1, items: [item(n, k)] } });
  });
  afterAll(async () => {
    await prisma.user.deleteMany({ where: { email: { contains: `-${t}@test.dev` } } });
    server.close();
  });

  it("foto: la imagen va al proveedor del usuario y lo reconocido se empareja con el catálogo", async () => {
    reply = JSON.stringify({ items: [{ name: `arroz blanco cocido zzfood${t}`, grams: 152.4 }, { name: "salsa misteriosa", grams: 20 }] });
    bodies.length = 0;
    const r = await ai.photoToDraft(userId, { mime: "image/jpeg", base64: Buffer.from("foto").toString("base64") });
    const content = (bodies[0].messages as Array<{ content: unknown }>)[1].content as Array<{ type: string; image_url?: { url: string } }>;
    expect(content[0]).toMatchObject({ type: "image_url", image_url: { url: `data:image/jpeg;base64,${Buffer.from("foto").toString("base64")}` } });
    expect(r.items[0]).toMatchObject({ grams: 152, match: { name: `Arroz blanco cocido zzfood${t}` } });
    expect(r.items[1].match).toBeNull();
  });

  it("plan semanal: solo recetas propias, raciones redondeadas a medias y totales por día", async () => {
    reply = JSON.stringify({ days: [{ date: "2026-10-12", meals: [{ mealType: "LUNCH", recipe: "lentejas", servings: 1.3 }, { mealType: "DINNER", recipe: "Hamburguesa inventada", servings: 1 }] }, { date: "2030-01-01", meals: [] }] });
    const d = await ai.suggestMealPlan(userId, "2026-10-12");
    expect(d.days).toHaveLength(7);
    expect(d.days[0]).toMatchObject({ date: "2026-10-12", kcal: 180, meals: [{ recipe: "Lentejas", servings: 1.5, kcal: 180 }] });
    expect(d.dropped).toBe(1);
    const prompt = JSON.parse(((bodies.at(-1)!.messages as Array<{ content: string }>)[1]).content);
    expect(prompt.recetas.map((r: { nombre: string }) => r.nombre).sort()).toEqual(["Lentejas", "Pasta con atún", "Pollo al horno"]);
    expect(JSON.stringify(prompt)).not.toMatch(/ciclo|lesi|salud/i);
  });

  it("sin consentimiento de IA no se envía nada", async () => {
    await prisma.user.update({ where: { id: userId }, data: { aiConsentAt: null } });
    bodies.length = 0;
    await expect(ai.photoToDraft(userId, { mime: "image/jpeg", base64: "eA==" })).rejects.toMatchObject({ status: 403 });
    expect(bodies).toHaveLength(0);
  });
});
