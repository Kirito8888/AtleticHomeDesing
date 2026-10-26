// v2.5 · Estudio B20: preguntas del Modo Juego con IA. Generar no escribe nada; las preguntas se anclan a los apuntes.
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
    const th = (q: string, ev: string) => ({ question: q, correct: "Matriz mitocondrial", distractors: ["Citosol", "Núcleo", "Golgi"], explanation: "Ahí ocurre.", evidence: ev });
    return {
      model: "modelo-de-prueba",
      data: schema.parse({
        theory: [
          th("¿Dónde ocurre el ciclo?", "El ciclo de Krebs ocurre en la matriz mitocondrial"),
          th("¿Y la inventada?", "Cita inventada que no está en los apuntes"),
          th("¿Dónde, otra vez?", "Produce NADH y FADH2 en cada vuelta"),
          th("¿Y una tercera?", "El ciclo de Krebs ocurre en la matriz mitocondrial"),
        ],
        practice: [{ question: "Lista el archivo", command: "tar -tvf krebs.tar", shell: "b", evidence: "tar -tvf krebs.tar" }],
      }),
    };
  },
}));

const HAS_DB = Boolean(process.env.DATABASE_URL);
const post = (body: unknown) => new NextRequest("http://localhost/api/ai/study/quest", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });

describe.skipIf(!HAS_DB)("preguntas del Modo Juego (BD real)", () => {
  let prisma: typeof import("@/lib/prisma").prisma;
  let st: typeof import("@/app/api/ai/study/quest/route");
  let me: string;
  let other: string;
  let mod: string;
  let emptyMod: string;
  let otherMod: string;
  let topic: string;
  const t = Date.now();
  const counts = async () => ({
    docs: await prisma.studyDocument.count({ where: { userId: me } }),
    chunks: await prisma.documentChunk.count({ where: { userId: me } }),
    topics: await prisma.studyTopic.count({ where: { userId: me } }),
    cards: await prisma.flashcard.count({ where: { deck: { userId: me } } }),
  });

  beforeAll(async () => {
    process.env.AUTH_SECRET ??= "secreto-auth-de-prueba";
    prisma = (await import("@/lib/prisma")).prisma;
    st = await import("@/app/api/ai/study/quest/route");
    me = (await prisma.user.create({ data: { email: `stq-${t}@test.dev`, name: "Atleta", aiConsentAt: new Date() } })).id;
    other = (await prisma.user.create({ data: { email: `stq2-${t}@test.dev`, name: "Otra" } })).id;
    current = { id: me, role: "ATHLETE" };
    mod = (await prisma.studyModule.create({ data: { userId: me, name: "Bioquímica" } })).id;
    emptyMod = (await prisma.studyModule.create({ data: { userId: me, name: "Vacía" } })).id;
    otherMod = (await prisma.studyModule.create({ data: { userId: other, name: "Ajena" } })).id;
    topic = (await prisma.studyTopic.create({ data: { userId: me, moduleId: mod, name: "Krebs", tag: "red" } })).id;
    await prisma.studyTopic.create({ data: { userId: other, moduleId: otherMod, name: "Ajeno", tag: "red" } });
    const doc = await prisma.studyDocument.create({ data: { userId: me, moduleId: mod, title: "Apuntes", mimeType: "text/markdown", storagePath: "", sizeBytes: 10, status: "EMBEDDED", embedModel: "texto" } });
    await prisma.documentChunk.create({ data: { documentId: doc.id, userId: me, chunkIndex: 0, content: "El ciclo de Krebs ocurre en la matriz mitocondrial. Produce NADH y FADH2 en cada vuelta. Para listar: tar -tvf krebs.tar" } });
  });
  afterAll(async () => {
    await prisma.user.deleteMany({ where: { id: { in: [me, other] } } });
  });

  it("devuelve preguntas saneadas, con el tema y las fuentes como datos, y no escribe nada", async () => {
    const before = await counts();
    const res = await st.POST(post({ moduleId: mod, nodeId: topic }), undefined as never);
    expect(res.status).toBe(200);
    const j = await res.json();
    expect(j.items.filter((i: { type: string }) => i.type === "t")).toHaveLength(3); // la de la cita inventada se descarta
    expect(j.items.find((i: { type: string }) => i.type === "p").p.sol).toBe("tar -tvf krebs.tar");
    expect(seenPrompt).toContain("<<<");
    expect(seenPrompt).toContain("matriz mitocondrial");
    expect(await counts()).toEqual(before);
  });
  it("el Jefe usa toda la asignatura", async () => {
    const res = await st.POST(post({ moduleId: mod, nodeId: "boss" }), undefined as never);
    expect(res.status).toBe(200);
  });
  it("409 sin apuntes procesados", async () => {
    const tid = (await prisma.studyTopic.create({ data: { userId: me, moduleId: emptyMod, name: "Nada" } })).id;
    expect((await st.POST(post({ moduleId: emptyMod, nodeId: tid }), undefined as never)).status).toBe(409);
  });
  it("404 con tema inexistente o asignatura ajena", async () => {
    expect((await st.POST(post({ moduleId: mod, nodeId: "no-existe" }), undefined as never)).status).toBe(404);
    const ajeno = (await prisma.studyTopic.findFirst({ where: { moduleId: otherMod } }))!.id;
    expect((await st.POST(post({ moduleId: otherMod, nodeId: ajeno }), undefined as never)).status).toBeGreaterThanOrEqual(403);
  });
});
