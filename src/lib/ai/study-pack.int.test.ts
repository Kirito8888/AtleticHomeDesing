// v2.6 · Paquete de estudio de un tema: generación por partes con validación y reintentos, parciales, aislamiento y servicio al juego.
import { NextRequest } from "next/server";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

let current = { id: "", role: "ATHLETE" as const };
vi.mock("@/auth", () => ({ auth: async () => null }));
vi.mock("@/lib/auth/session", async (orig) => ({ ...(await orig<typeof import("@/lib/auth/session")>()), requireUser: async () => current }));
vi.mock("@/lib/ai/guard", () => ({ assertAiAllowed: async () => {} }));
vi.mock("@/lib/ai/llm", async (orig) => ({
  ...(await orig<typeof import("@/lib/ai/llm")>()),
  embedTexts: async () => null,
  generateJson: async () => {
    throw new Error("el juego no debe llamar a la IA cuando hay paquete");
  },
}));

const HAS_DB = Boolean(process.env.DATABASE_URL);
const SOURCE = [
  "El comando useradd crea usuarios nuevos en el sistema operativo.",
  "El fichero /etc/passwd guarda la lista de cuentas de usuario.",
  "El comando passwd cambia la contraseña de una cuenta existente.",
  "Los grupos secundarios se gestionan con el comando usermod desde la consola.",
  "El comando userdel elimina una cuenta de usuario del sistema.",
  "$ useradd -m ana",
  "$ passwd ana",
  "$ userdel -r ana",
].join("\n");

describe.skipIf(!HAS_DB)("paquete de estudio (BD real)", () => {
  let prisma: typeof import("@/lib/prisma").prisma;
  let sp: typeof import("@/lib/ai/study-pack");
  let fake: typeof import("@/lib/study/pack-fake");
  let quest: typeof import("@/app/api/ai/study/quest/route");
  let me: string;
  let other: string;
  let mod: string;
  let topic: string;
  let topic2: string;
  let otherTopic: string;
  const t = Date.now();
  const sleeps: number[] = [];
  const sleep = async (ms: number) => void sleeps.push(ms);

  // IA de prueba: respuestas del simulador, con fallos programables por llamada.
  const makeAi = (plan: (n: number, prompt: string) => "ok" | "bad-json" | "bad-schema" | "bad-source" | "429" | "503" | "recitation" | "max-tokens" = () => "ok") => {
    const calls: string[] = [];
    const ai = {
      model: "modelo-de-prueba",
      async text(p: { prompt: string }) {
        const n = calls.push(p.prompt);
        const mode = plan(n, p.prompt);
        if (mode === "429") {
          const { ApiError } = await import("@/lib/api");
          throw new ApiError(429, "límite");
        }
        if (mode === "503") {
          const { providerError } = await import("@/lib/ai/provider");
          throw providerError("GEMINI", 503, "This model is currently experiencing high demand", null);
        }
        if (mode === "recitation" || mode === "max-tokens") {
          const { ApiError } = await import("@/lib/api");
          const reason = mode === "recitation" ? "RECITATION" : "MAX_TOKENS";
          throw new ApiError(502, `Google Gemini no devolvió contenido (${reason})`, { code: "ai_empty", reason });
        }
        if (mode === "bad-json") return { text: "esto no es json" };
        if (mode === "bad-schema") return { text: JSON.stringify({ theoryTest: [{ question: "x" }] }) };
        const isSummary = p.prompt.includes("RESUMEN DE ESTUDIO");
        let text = isSummary ? fake.fakeSummaryJson(p.prompt) : fake.fakeBatchJson(p.prompt);
        if (mode === "bad-source") text = text.replace(/"evidence":"[^"]*"/g, '"evidence":"Frase inventada que no sale en los apuntes jamás"');
        return { text, inputTokens: 100, outputTokens: 50 };
      },
    };
    return { ai, calls };
  };
  const wipe = async (id: string) => void (await prisma.studyTopicPack.deleteMany({ where: { topicId: id } }));
  const post = (url: string, body: unknown) => new NextRequest(`http://localhost${url}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });

  beforeAll(async () => {
    process.env.AUTH_SECRET ??= "secreto-auth-de-prueba";
    process.env.LIFEOS_FAKE_AI = "1";
    prisma = (await import("@/lib/prisma")).prisma;
    sp = await import("@/lib/ai/study-pack");
    fake = await import("@/lib/study/pack-fake");
    quest = await import("@/app/api/ai/study/quest/route");
    me = (await prisma.user.create({ data: { email: `pk-${t}@test.dev`, name: "Atleta", aiConsentAt: new Date() } })).id;
    other = (await prisma.user.create({ data: { email: `pk2-${t}@test.dev`, name: "Otra", aiConsentAt: new Date() } })).id;
    current = { id: me, role: "ATHLETE" };
    mod = (await prisma.studyModule.create({ data: { userId: me, name: "ASO" } })).id;
    const otherMod = (await prisma.studyModule.create({ data: { userId: other, name: "Ajena" } })).id;
    const mkDoc = async (userId: string, moduleId: string, text: string) => {
      const d = await prisma.studyDocument.create({ data: { userId, moduleId, title: "Apuntes", mimeType: "text/markdown", storagePath: "", sizeBytes: 10, status: "EMBEDDED", embedModel: "texto" } });
      await prisma.documentChunk.create({ data: { documentId: d.id, userId, chunkIndex: 0, content: text } });
      return d.id;
    };
    const doc = await mkDoc(me, mod, SOURCE);
    topic = (await prisma.studyTopic.create({ data: { userId: me, moduleId: mod, name: "Usuarios", tag: "red", documentId: doc } })).id;
    topic2 = (await prisma.studyTopic.create({ data: { userId: me, moduleId: mod, name: "Sin apuntes", tag: "yellow" } })).id;
    const odoc = await mkDoc(other, otherMod, SOURCE);
    otherTopic = (await prisma.studyTopic.create({ data: { userId: other, moduleId: otherMod, name: "Ajeno", documentId: odoc } })).id;
  });
  afterAll(async () => {
    await prisma.user.deleteMany({ where: { id: { in: [me, other] } } });
  });

  it("genera resumen y banco del juego, válidos y respaldados por las fuentes", async () => {
    const { ai, calls } = makeAi();
    await sp.preparePack(me, topic);
    await sp.runPack(me, topic, {}, { ai, sleep, minIntervalMs: 0 });
    const p = await sp.getPack(me, topic);
    expect(p?.status).toBe("READY");
    expect(calls).toHaveLength(2); // resumen + 1 parte
    expect(p?.summary?.tenMinutes).toHaveLength(5);
    expect(p?.summary?.selfTest.questions).toHaveLength(10);
    expect(p?.meta).toMatchObject({ done: 2, total: 2, failed: [] });
    const items = await sp.packItems(me, topic);
    expect(items.length).toBeGreaterThanOrEqual(8);
    expect(items.every((i) => i.id.startsWith(`pk:${topic}:`))).toBe(true);
    const cmd = items.filter((i) => i.type === "p");
    expect(cmd.length).toBeGreaterThan(0);
    expect(cmd.every((i) => SOURCE.includes(i.p!.sol))).toBe(true);
    const row = await prisma.studyTopicPack.findUnique({ where: { topicId: topic } });
    expect(row).toMatchObject({ inputTokens: 200, outputTokens: 100, model: "modelo-de-prueba" }); // 2 llamadas × (100 + 50)
  });

  it("el prompt manda las fuentes como datos y exige Errata y no inventar", async () => {
    await wipe(topic);
    const { ai, calls } = makeAi();
    await sp.preparePack(me, topic);
    await sp.runPack(me, topic, {}, { ai, sleep, minIntervalMs: 0 });
    expect(calls[0]).toContain("<<<");
    expect(calls[0]).toContain("useradd");
    const mod = await import("@/lib/study/pack-prompts");
    expect(mod.PACK_SYSTEM).toMatch(/Errata/);
    expect(mod.PACK_SYSTEM).toMatch(/SOLO las fuentes/);
    expect(mod.PACK_SYSTEM).toMatch(/PROHIBIDO inventar/);
  });

  it("reintenta con los fallos cuando la respuesta no es JSON o no cumple el esquema", async () => {
    await wipe(topic);
    const { ai, calls } = makeAi((n) => (n === 1 ? "bad-json" : n === 2 ? "bad-schema" : "ok"));
    await sp.preparePack(me, topic);
    await sp.runPack(me, topic, {}, { ai, sleep, minIntervalMs: 0 });
    expect((await sp.getPack(me, topic))?.status).toBe("READY");
    expect(calls[1]).toContain("NO fue válida");
    expect(calls[2]).toContain("NO fue válida");
    expect(calls).toHaveLength(4); // resumen: 3 intentos; parte: 1
  });

  it("citas inventadas: se descartan y, si no queda nada, se reintenta; el paquete queda PARCIAL y solo se rehace lo que falló", async () => {
    await wipe(topic);
    // El resumen sale bien; la parte falla siempre.
    const bad = makeAi((_n, prompt) => (prompt.includes("RESUMEN DE ESTUDIO") ? "ok" : "bad-source"));
    await sp.preparePack(me, topic);
    await sp.runPack(me, topic, {}, { ai: bad.ai, sleep, minIntervalMs: 0 });
    const p = await sp.getPack(me, topic);
    expect(p?.status).toBe("PARTIAL");
    expect(p?.meta?.failed).toHaveLength(1);
    expect(p?.meta?.failed[0].part).toBe("g1");
    expect(p?.summary).not.toBeNull();
    expect(bad.calls).toHaveLength(1 + 3);

    const good = makeAi();
    await sp.preparePack(me, topic);
    await sp.runPack(me, topic, {}, { ai: good.ai, sleep, minIntervalMs: 0 });
    expect(good.calls).toHaveLength(1); // solo la parte que faltaba
    expect(good.calls[0]).not.toContain("RESUMEN DE ESTUDIO");
    expect((await sp.getPack(me, topic))?.status).toBe("READY");
  });

  it("si nada se puede generar queda FAILED con el motivo", async () => {
    await wipe(topic);
    const { ai } = makeAi(() => "bad-json");
    await sp.preparePack(me, topic);
    await sp.runPack(me, topic, {}, { ai, sleep, minIntervalMs: 0 });
    const p = await sp.getPack(me, topic);
    expect(p?.status).toBe("FAILED");
    expect(p?.error).toBeTruthy();
  });

  it("ante un 429 espera y repite sin gastar reintentos de validación", async () => {
    await wipe(topic);
    sleeps.length = 0;
    const { ai, calls } = makeAi((n) => (n <= 2 ? "429" : "ok"));
    await sp.preparePack(me, topic);
    await sp.runPack(me, topic, {}, { ai, sleep, minIntervalMs: 0 });
    expect((await sp.getPack(me, topic))?.status).toBe("READY");
    expect(sleeps.slice(0, 2)).toEqual([15_000, 30_000]);
    expect(calls).toHaveLength(4);
  });

  it("ante un 503 del proveedor («high demand») espera y repite, y acaba generando el paquete", async () => {
    await wipe(topic);
    sleeps.length = 0;
    const { ai, calls } = makeAi((n) => (n <= 3 ? "503" : "ok"));
    await sp.preparePack(me, topic);
    await sp.runPack(me, topic, {}, { ai, sleep, minIntervalMs: 0 });
    expect((await sp.getPack(me, topic))?.status).toBe("READY");
    expect(sleeps.slice(0, 3)).toEqual([15_000, 30_000, 60_000]);
    expect(calls).toHaveLength(5); // 3 intentos con 503 + resumen + 1 parte
  });

  it("respuesta vacía por RECITATION: reintenta pidiendo citas cortas y acaba con resumen y preguntas reales", async () => {
    await wipe(topic);
    const { ai, calls } = makeAi((n) => (n === 1 ? "recitation" : "ok"));
    await sp.preparePack(me, topic);
    await sp.runPack(me, topic, {}, { ai, sleep, minIntervalMs: 0 });
    const p = await sp.getPack(me, topic);
    expect(p?.status).toBe("READY");
    expect(p?.summary).not.toBeNull();
    expect(p?.questions).toBeGreaterThan(0);
    expect(calls[1]).toMatch(/RECITATION[\s\S]*120 caracteres/);
    expect((await prisma.studyTopicPack.findUnique({ where: { topicId: topic } }))?.outputTokens).toBeGreaterThan(0);
  });

  it("si la IA siempre llega vacía (MAX_TOKENS) el paquete queda FAILED con el motivo, sin lanzar", async () => {
    await wipe(topic);
    const { ai } = makeAi(() => "max-tokens");
    await sp.preparePack(me, topic);
    await sp.runPack(me, topic, {}, { ai, sleep, minIntervalMs: 0 });
    const p = await sp.getPack(me, topic);
    expect(p?.status).toBe("FAILED");
    expect(p?.error).toMatch(/MAX_TOKENS/);
  });

  it("si el proveedor sigue caído tras todas las esperas, el paquete queda FAILED con el motivo (no se pierde nada)", async () => {
    await wipe(topic);
    const { ai } = makeAi(() => "503");
    await sp.preparePack(me, topic);
    await sp.runPack(me, topic, {}, { ai, sleep, minIntervalMs: 0 });
    const p = await sp.getPack(me, topic);
    expect(p?.status).toBe("FAILED");
    expect(p?.error).toMatch(/503/);
  });

  it("respeta la pausa mínima entre llamadas", async () => {
    await wipe(topic);
    sleeps.length = 0;
    const { ai } = makeAi();
    await sp.preparePack(me, topic);
    await sp.runPack(me, topic, {}, { ai, sleep, minIntervalMs: 4000 });
    expect(sleeps.some((s) => s > 0 && s <= 4000)).toBe(true);
  });

  it("L2 · con la IA local no hay pausa entre llamadas aunque STUDY_PACK_MIN_INTERVAL_MS esté fijada", async () => {
    await wipe(topic);
    sleeps.length = 0;
    const prev = process.env.STUDY_PACK_MIN_INTERVAL_MS;
    process.env.STUDY_PACK_MIN_INTERVAL_MS = "4000";
    vi.resetModules();
    try {
      const fresh = await import("@/lib/ai/study-pack");
      const { ai } = makeAi();
      await fresh.preparePack(me, topic);
      await fresh.runPack(me, topic, {}, { ai: { ...ai, local: true }, sleep });
      expect(sleeps).toEqual([]);
      sleeps.length = 0;
      await wipe(topic);
      await fresh.preparePack(me, topic);
      await fresh.runPack(me, topic, {}, { ai, sleep }); // proveedor externo: sí respeta la variable
      expect(sleeps.some((s) => s > 0 && s <= 4000)).toBe(true);
    } finally {
      if (prev === undefined) delete process.env.STUDY_PACK_MIN_INTERVAL_MS;
      else process.env.STUDY_PACK_MIN_INTERVAL_MS = prev;
      vi.resetModules();
    }
  });

  it("L2 · si la IA local no devuelve JSON válido en una parte, queda PARCIAL con aviso claro y sin lanzar", async () => {
    await wipe(topic);
    const bad = makeAi((_n, prompt) => (prompt.includes("RESUMEN DE ESTUDIO") ? "ok" : "bad-json"));
    await sp.preparePack(me, topic);
    await expect(sp.runPack(me, topic, {}, { ai: { ...bad.ai, local: true }, sleep })).resolves.toBeUndefined();
    const p = await sp.getPack(me, topic);
    expect(p?.status).toBe("PARTIAL");
    expect(p?.meta?.failed).toHaveLength(1);
    expect(p?.meta?.failed[0].part).toBe("g1");
    expect(p?.meta?.failed[0].error).toMatch(/JSON válido tras 3 intentos/);
    expect(p?.summary).not.toBeNull();
    expect(bad.calls).toHaveLength(1 + 3);
  });

  it("L2 · la caducidad del trabajo cubre el peor caso con la IA local", async () => {
    const { PACK_EXPIRE_SECONDS } = await import("@/lib/jobs/queue");
    const calls = 1 + 6; // resumen + máximo de partes
    const attempts = sp.MAX_VALIDATION_RETRIES + 1;
    expect(PACK_EXPIRE_SECONDS).toBeGreaterThanOrEqual(calls * attempts * 300);
  });

  it("no genera sin apuntes (409), ni de un tema ajeno (404); getPack tampoco lo revela", async () => {
    await expect(sp.preparePack(me, topic2)).rejects.toMatchObject({ status: 409 });
    await expect(sp.preparePack(me, otherTopic)).rejects.toMatchObject({ status: 404 });
    await expect(sp.getPack(me, otherTopic)).rejects.toMatchObject({ status: 404 });
    expect(await sp.packItems(me, otherTopic)).toEqual([]);
  });

  it("si cambian los apuntes se descarta lo generado; si no, se conserva", async () => {
    await wipe(topic);
    const { ai } = makeAi();
    await sp.preparePack(me, topic);
    await sp.runPack(me, topic, {}, { ai, sleep, minIntervalMs: 0 });
    await sp.preparePack(me, topic); // mismos apuntes: conserva
    expect((await sp.getPack(me, topic))?.summary).not.toBeNull();
    const d = (await prisma.studyTopic.findUnique({ where: { id: topic } }))!.documentId!;
    await prisma.documentChunk.create({ data: { documentId: d, userId: me, chunkIndex: 1, content: "Otra frase nueva que cambia el texto de los apuntes del tema." } });
    await sp.preparePack(me, topic);
    expect((await sp.getPack(me, topic))?.summary).toBeNull();
    await prisma.documentChunk.deleteMany({ where: { documentId: d, chunkIndex: 1 } });
    await sp.preparePack(me, topic, { force: true });
  });

  it("un RUNNING sin actividad se muestra como interrumpido", async () => {
    await prisma.studyTopicPack.update({ where: { topicId: topic }, data: { status: "RUNNING" } });
    await prisma.$executeRaw`UPDATE "StudyTopicPack" SET "updatedAt" = now() - interval '2 hours' WHERE "topicId" = ${topic}`;
    const p = await sp.getPack(me, topic);
    expect(p?.status).toBe("FAILED");
    expect(p?.error).toMatch(/interrumpi/);
  });

  describe("el juego sirve el paquete sin llamar a la IA", () => {
    beforeAll(async () => {
      await wipe(topic);
      const { ai } = makeAi();
      await sp.preparePack(me, topic);
      await sp.runPack(me, topic, {}, { ai, sleep, minIntervalMs: 0 });
    });
    it("nivel, Jefe y examen final", async () => {
      const lvl = await (await quest.POST(post("/api/ai/study/quest", { moduleId: mod, nodeId: topic }), undefined as never)).json();
      expect(lvl.source).toBe("pack");
      expect(lvl.items.length).toBeGreaterThanOrEqual(8);
      const boss = await (await quest.POST(post("/api/ai/study/quest", { moduleId: mod, nodeId: "boss" }), undefined as never)).json();
      expect(boss.source).toBe("pack");
      const fin = await (await quest.POST(post("/api/ai/study/quest", { moduleId: mod, nodeId: "final" }), undefined as never)).json();
      expect(fin.source).toBe("pack");
      expect(fin.minutes).toBe(35);
      expect(fin.items.length).toBeGreaterThanOrEqual(8);
    });
    it("examen final sin ningún paquete: 409", async () => {
      await wipe(topic);
      const res = await quest.POST(post("/api/ai/study/quest", { moduleId: mod, nodeId: "final" }), undefined as never);
      expect(res.status).toBe(409);
    });
  });
});
