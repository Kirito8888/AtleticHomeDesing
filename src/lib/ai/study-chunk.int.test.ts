// v2.5 · Estudio B13: fraccionador de temarios. Generar no escribe nada; los pasos salen acotados a 6 y 5–15 min.
import { NextRequest } from "next/server";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

let current = { id: "", role: "ATHLETE" as const };
vi.mock("@/auth", () => ({ auth: async () => null }));
vi.mock("@/lib/auth/session", async (orig) => ({ ...(await orig<typeof import("@/lib/auth/session")>()), requireUser: async () => current }));
vi.mock("@/lib/ai/guard", () => ({ assertAiAllowed: async () => {} }));
vi.mock("@/lib/ai/llm", async (orig) => ({
  ...(await orig<typeof import("@/lib/ai/llm")>()),
  embedTexts: async () => null,
  generateJson: async (schema: { parse: (v: unknown) => unknown }) => ({
    model: "modelo-de-prueba",
    data: schema.parse({
      title: "**Glucólisis**",
      steps: Array.from({ length: 9 }, (_, i) => ({ action: `**Lee** el apartado ${i + 1}`, minutes: 40, check: "Resúmelo en una frase" })),
    }),
  }),
}));

const WALL =
  "La **glucólisis** es la vía que convierte la glucosa en piruvato. Ocurre en el citoplasma de la célula. Produce 2 ATP netos por molécula de glucosa. " +
  "Si hay oxígeno, el piruvato entra en la mitocondria. Si no lo hay, se convierte en lactato para regenerar NAD+.";

const HAS_DB = Boolean(process.env.DATABASE_URL);
const post = (body: unknown) =>
  new NextRequest("http://localhost/api/ai/study/chunk", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });

describe.skipIf(!HAS_DB)("fraccionar temario (BD real)", () => {
  let prisma: typeof import("@/lib/prisma").prisma;
  let chunk: typeof import("@/app/api/ai/study/chunk/route");
  let me: string;
  let other: string;
  let docId: string;
  let otherDoc: string;
  const t = Date.now();
  const counts = async () => ({
    docs: await prisma.studyDocument.count({ where: { userId: me } }),
    chunks: await prisma.documentChunk.count({ where: { userId: me } }),
    cards: await prisma.flashcard.count({ where: { deck: { userId: me } } }),
  });

  beforeAll(async () => {
    process.env.AUTH_SECRET ??= "secreto-auth-de-prueba";
    prisma = (await import("@/lib/prisma")).prisma;
    chunk = await import("@/app/api/ai/study/chunk/route");
    me = (await prisma.user.create({ data: { email: `ck-${t}@test.dev`, name: "Atleta", aiConsentAt: new Date() } })).id;
    other = (await prisma.user.create({ data: { email: `ck2-${t}@test.dev`, name: "Otra" } })).id;
    current = { id: me, role: "ATHLETE" };
    const mk = (userId: string, title: string) => prisma.studyDocument.create({ data: { userId, title, mimeType: "text/markdown", storagePath: "", sizeBytes: 10, status: "EMBEDDED", embedModel: "texto" } });
    docId = (await mk(me, "Bioquímica")).id;
    otherDoc = (await mk(other, "Ajeno")).id;
    await prisma.documentChunk.create({ data: { documentId: docId, userId: me, chunkIndex: 0, content: WALL } });
    await prisma.documentChunk.create({ data: { documentId: otherDoc, userId: other, chunkIndex: 0, content: "Texto de otra persona." } });
  });
  afterAll(async () => {
    await prisma.user.deleteMany({ where: { id: { in: [me, other] } } });
  });

  it("9 pasos de 40 min salen como 6 de ≤ 15 min, sin markdown, y no se escribe nada", async () => {
    const before = await counts();
    for (const source of [{ kind: "text", text: WALL }, { kind: "document", documentId: docId }]) {
      const res = await chunk.POST(post({ source }), undefined as never);
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.title).toBe("Glucólisis");
      expect(body.steps).toHaveLength(6);
      for (const s of body.steps) {
        expect(s.minutes).toBeGreaterThanOrEqual(5);
        expect(s.minutes).toBeLessThanOrEqual(15);
        expect(s.action).not.toContain("**");
      }
    }
    expect(await counts()).toEqual(before);
  });

  it("apunte ajeno 404, cuerpo inválido 400, tema sin coincidencias 422", async () => {
    expect((await chunk.POST(post({ source: { kind: "document", documentId: otherDoc } }), undefined as never)).status).toBe(404);
    expect((await chunk.POST(post({ source: { kind: "text", text: "corto" } }), undefined as never)).status).toBe(400);
    expect((await chunk.POST(post({}), undefined as never)).status).toBe(400);
    expect((await chunk.POST(post({ source: { kind: "topic", topic: "astrofísica cuántica" } }), undefined as never)).status).toBe(422);
  });
});
