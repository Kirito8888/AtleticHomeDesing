// v2.5 · Estudio B16: test de autoevaluación. Generar no escribe nada; las citas se verifican contra los apuntes.
import { NextRequest } from "next/server";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

let current = { id: "", role: "ATHLETE" as const };
let seenPrompt = "";
vi.mock("@/auth", () => ({ auth: async () => null }));
vi.mock("@/lib/auth/session", async (orig) => ({ ...(await orig<typeof import("@/lib/auth/session")>()), requireUser: async () => current }));
vi.mock("@/lib/ai/guard", () => ({ assertAiAllowed: async () => {} }));
vi.mock("@/lib/ai/llm", async (orig) => ({
  ...(await orig<typeof import("@/lib/ai/llm")>()),
  embedTexts: async () => null,
  generateJson: async (schema: { parse: (v: unknown) => unknown }, p: { prompt: string }) => {
    seenPrompt = p.prompt;
    return {
      model: "modelo-de-prueba",
      data: schema.parse({
        questions: [
          { kind: "choice", topic: "Krebs", question: "¿Dónde ocurre el ciclo?", options: ["Matriz", "Citosol", "Núcleo", "Golgi"], answer: 0, explanation: "En la mitocondria.", evidence: "El ciclo de Krebs ocurre en la matriz mitocondrial" },
          { kind: "choice", topic: "Krebs", question: "¿Qué produce?", options: ["NADH", "Nada", "Glucosa", "Lípidos"], answer: 0, explanation: "Coenzimas.", evidence: "Produce NADH y FADH2 en cada vuelta" },
          { kind: "case", topic: "Krebs", question: "Una célula sin oxígeno, ¿qué le pasa al ciclo?", solution: "Se frena por falta de NAD+.", explanation: "Depende del oxígeno.", evidence: "Cita inventada que no está en los apuntes" },
        ],
      }),
    };
  },
}));

const HAS_DB = Boolean(process.env.DATABASE_URL);
const post = (body: unknown) => new NextRequest("http://localhost/api/ai/study/self-test", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });

describe.skipIf(!HAS_DB)("test de autoevaluación (BD real)", () => {
  let prisma: typeof import("@/lib/prisma").prisma;
  let st: typeof import("@/app/api/ai/study/self-test/route");
  let me: string;
  let other: string;
  let mod: string;
  let emptyMod: string;
  let otherMod: string;
  const t = Date.now();
  const counts = async () => ({
    docs: await prisma.studyDocument.count({ where: { userId: me } }),
    topics: await prisma.studyTopic.count({ where: { userId: me } }),
    cards: await prisma.flashcard.count({ where: { deck: { userId: me } } }),
  });

  beforeAll(async () => {
    process.env.AUTH_SECRET ??= "secreto-auth-de-prueba";
    prisma = (await import("@/lib/prisma")).prisma;
    st = await import("@/app/api/ai/study/self-test/route");
    me = (await prisma.user.create({ data: { email: `stt-${t}@test.dev`, name: "Atleta", aiConsentAt: new Date() } })).id;
    other = (await prisma.user.create({ data: { email: `stt2-${t}@test.dev`, name: "Otra" } })).id;
    current = { id: me, role: "ATHLETE" };
    mod = (await prisma.studyModule.create({ data: { userId: me, name: "Bioquímica" } })).id;
    emptyMod = (await prisma.studyModule.create({ data: { userId: me, name: "Vacía" } })).id;
    otherMod = (await prisma.studyModule.create({ data: { userId: other, name: "Ajena" } })).id;
    await prisma.studyTopic.create({ data: { userId: me, moduleId: mod, name: "Krebs", tag: "red" } });
    await prisma.studyTopic.create({ data: { userId: me, moduleId: emptyMod, name: "Nada", tag: "red" } });
    const doc = await prisma.studyDocument.create({ data: { userId: me, moduleId: mod, title: "Apuntes", mimeType: "text/markdown", storagePath: "", sizeBytes: 10, status: "EMBEDDED", embedModel: "texto" } });
    await prisma.documentChunk.create({ data: { documentId: doc.id, userId: me, chunkIndex: 0, content: "El ciclo de Krebs ocurre en la matriz mitocondrial. Produce NADH y FADH2 en cada vuelta." } });
  });
  afterAll(async () => {
    await prisma.user.deleteMany({ where: { id: { in: [me, other] } } });
  });

  it("redacta sobre los apuntes, verifica citas y no escribe nada", async () => {
    const before = await counts();
    const res = await st.POST(post({ moduleId: mod, count: 6, weak: ["Krebs"] }), undefined as never);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.questions).toHaveLength(3);
    expect(body.questions.map((q: { verified: boolean }) => q.verified)).toEqual([true, true, false]);
    expect(body.questions[0].tag).toBe("red");
    expect(seenPrompt).toMatch(/tema: Krebs/);
    expect(seenPrompt).toMatch(/matriz mitocondrial/);
    expect(await counts()).toEqual(before);
  });

  it("asignatura ajena 404, sin apuntes 409, cuerpo inválido 400", async () => {
    expect((await st.POST(post({ moduleId: otherMod }), undefined as never)).status).toBe(404);
    expect((await st.POST(post({ moduleId: emptyMod }), undefined as never)).status).toBe(409);
    expect((await st.POST(post({ moduleId: mod, count: 99 }), undefined as never)).status).toBe(400);
    expect((await st.POST(post({}), undefined as never)).status).toBe(400);
  });
});
