// v2.5 · Estudio B12: resumen TDAH / esquema visual. Generar no escribe nada; guardar crea un apunte nuevo.
import { NextRequest } from "next/server";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

let current = { id: "", role: "ATHLETE" as const };
vi.mock("@/auth", () => ({ auth: async () => null }));
vi.mock("@/lib/auth/session", async (orig) => ({ ...(await orig<typeof import("@/lib/auth/session")>()), requireUser: async () => current }));
const WALL =
  "La **glucólisis** es la vía que convierte la glucosa en piruvato. Ocurre en el citoplasma de la célula. Produce 2 ATP netos por molécula de glucosa. " +
  "Si hay oxígeno, el piruvato entra en la mitocondria. Si no lo hay, se convierte en lactato para regenerar NAD+.";
vi.mock("@/lib/ai/guard", () => ({ assertAiAllowed: async () => {} }));
vi.mock("@/lib/ai/llm", async (orig) => ({
  ...(await orig<typeof import("@/lib/ai/llm")>()),
  embedTexts: async () => null,
  generateJson: async (schema: { parse: (v: unknown) => unknown }) => ({
    model: "modelo-de-prueba",
    data: schema.parse({
      title: "Glucólisis",
      oneLiner: WALL,
      sections: [{ heading: "Vía", blocks: [WALL] }],
      remember: ["Citoplasma"],
      root: { label: "Glucólisis", children: [{ label: "Fase", detail: WALL }] },
      map: [{ topic: "Glucólisis", tag: "red", minutes: 20 }],
      topics: [{ name: "Glucólisis", tag: "red", inThirty: [WALL], concepts: [WALL, "**ATP**"] }],
      cheatSheet: [{ group: "Cifras", terms: ["**2 ATP**"] }],
      selfTest: [{ topic: "Glucólisis", recall: ["¿Dónde ocurre?", "¿Cuántos ATP?", "¿Y sin oxígeno?"], exercise: WALL, solutions: ["Citoplasma", "2", "Lactato"] }],
      lastTen: ["**Citoplasma**"],
    }),
  }),
}));

const HAS_DB = Boolean(process.env.DATABASE_URL);
const post = (url: string, body: unknown) =>
  new NextRequest(`http://localhost${url}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });

describe.skipIf(!HAS_DB)("adaptar apuntes (BD real)", () => {
  let prisma: typeof import("@/lib/prisma").prisma;
  let adapt: typeof import("@/app/api/ai/study/adapt/route");
  let save: typeof import("@/app/api/ai/study/adapt/save/route");
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
    adapt = await import("@/app/api/ai/study/adapt/route");
    save = await import("@/app/api/ai/study/adapt/save/route");
    me = (await prisma.user.create({ data: { email: `ad-${t}@test.dev`, name: "Atleta", aiConsentAt: new Date() } })).id;
    other = (await prisma.user.create({ data: { email: `ad2-${t}@test.dev`, name: "Otra" } })).id;
    current = { id: me, role: "ATHLETE" };
    const mk = (userId: string, title: string) => prisma.studyDocument.create({ data: { userId, title, mimeType: "text/markdown", storagePath: "", sizeBytes: 10, status: "EMBEDDED", embedModel: "texto" } });
    docId = (await mk(me, "Bioquímica")).id;
    otherDoc = (await mk(other, "Ajeno")).id;
    await prisma.documentChunk.create({ data: { documentId: docId, userId: me, chunkIndex: 0, content: WALL } });
    await prisma.documentChunk.create({ data: { documentId: otherDoc, userId: other, chunkIndex: 0, content: "Texto de otra persona sobre mitocondrias." } });
  });
  afterAll(async () => {
    await prisma.user.deleteMany({ where: { id: { in: [me, other] } } });
  });

  it("resumen: la respuesta del modelo (muro de texto) sale normalizada y no escribe nada", async () => {
    const before = await counts();
    const res = await adapt.POST(post("/api/ai/study/adapt", { mode: "summary", source: { kind: "document", documentId: docId } }), undefined as never);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.content.mode).toBe("summary");
    expect(body.content.doc.oneLiner.length).toBeLessThanOrEqual(120);
    for (const b of body.content.doc.sections[0].blocks) expect(b.length).toBeLessThanOrEqual(120);
    expect(body.content.doc.sections[0].blocks.length).toBeGreaterThan(1);
    expect(body.markdown).toContain("## Vía");
    expect(await counts()).toEqual(before);
  });

  it("esquema: devuelve el árbol y la lista indentada", async () => {
    const body = await (await adapt.POST(post("/api/ai/study/adapt", { mode: "outline", source: { kind: "text", text: WALL } }), undefined as never)).json();
    expect(body.content.mode).toBe("outline");
    expect(body.content.doc.root.children[0].detail.length).toBeLessThanOrEqual(120);
    expect(body.markdown).toMatch(/^- Glucólisis\n {2}- Fase/m);
  });

  it("informe TDAH: 6 secciones, viñetas de ≤ 15 palabras y no escribe nada", async () => {
    const before = await counts();
    const res = await adapt.POST(post("/api/ai/study/adapt", { mode: "report", source: { kind: "document", documentId: docId } }), undefined as never);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.content.mode).toBe("report");
    for (const h of ["## 0. Mapa general", "## 1. Plan de ataque", "## 2. Desglose por tema", "## 3. Chuleta final", "## 4. Autoevaluación", "### Soluciones", "## 5. Últimos 10 minutos"]) expect(body.markdown).toContain(h);
    const words = (s: string) => s.replace(/\*\*/g, "").split(/\s+/).filter(Boolean).length;
    for (const c of body.content.doc.topics[0].concepts) expect(words(c)).toBeLessThanOrEqual(15);
    for (const l of body.content.doc.topics[0].inThirty) expect(words(l)).toBeLessThanOrEqual(15);
    expect(body.content.doc.selfTest[0].recall).toHaveLength(3);
    expect(await counts()).toEqual(before);
  });

  it("guardar el informe crea un apunte nuevo y no toca el original", async () => {
    const gen = await (await adapt.POST(post("/api/ai/study/adapt", { mode: "report", source: { kind: "text", text: WALL } }), undefined as never)).json();
    const original = await prisma.documentChunk.findMany({ where: { documentId: docId } });
    const before = await counts();
    const res = await save.POST(post("/api/ai/study/adapt/save", { content: gen.content }), undefined as never);
    expect(res.status).toBe(201);
    expect((await res.json()).title).toMatch(/^Informe TDAH · /);
    expect((await counts()).docs).toBe(before.docs + 1);
    expect(await prisma.documentChunk.findMany({ where: { documentId: docId } })).toEqual(original);
  });

  it("un apunte ajeno es 404; un cuerpo inválido, 400; un tema sin coincidencias, 422", async () => {
    expect((await adapt.POST(post("/api/ai/study/adapt", { mode: "summary", source: { kind: "document", documentId: otherDoc } }), undefined as never)).status).toBe(404);
    expect((await adapt.POST(post("/api/ai/study/adapt", { mode: "poema", source: { kind: "text", text: WALL } }), undefined as never)).status).toBe(400);
    expect((await adapt.POST(post("/api/ai/study/adapt", { mode: "summary", source: { kind: "text", text: "corto" } }), undefined as never)).status).toBe(400);
    expect((await adapt.POST(post("/api/ai/study/adapt", { mode: "summary", source: { kind: "topic", topic: "astrofísica cuántica" } }), undefined as never)).status).toBe(422);
  });

  it("guardar crea un apunte NUEVO buscable; el original y sus flashcards no cambian", async () => {
    const gen = await (await adapt.POST(post("/api/ai/study/adapt", { mode: "summary", source: { kind: "document", documentId: docId } }), undefined as never)).json();
    const original = await prisma.documentChunk.findMany({ where: { documentId: docId } });
    const before = await counts();
    const res = await save.POST(post("/api/ai/study/adapt/save", { content: gen.content }), undefined as never);
    expect(res.status).toBe(201);
    const doc = await res.json();
    expect(doc).toMatchObject({ status: "EMBEDDED", mimeType: "text/markdown", embedModel: "texto" });
    expect(doc.title).toMatch(/^Resumen TDAH · Glucólisis/);
    const after = await counts();
    expect(after.docs).toBe(before.docs + 1);
    expect(after.cards).toBe(before.cards);
    expect(await prisma.documentChunk.findMany({ where: { documentId: docId } })).toEqual(original);
    const { searchChunks } = await import("@/lib/ai/rag");
    expect((await searchChunks(me, "citoplasma", 5, [doc.id], { embed: async () => null })).length).toBeGreaterThan(0);
  });

  it("guardar no se fía del cliente: un muro de texto se normaliza y un modo falso se rechaza", async () => {
    const res = await save.POST(post("/api/ai/study/adapt/save", { title: "Mío", content: { mode: "summary", doc: { title: "T", oneLiner: "x", sections: [{ heading: "H", blocks: [WALL + WALL] }], remember: [] } } }), undefined as never);
    expect(res.status).toBe(201);
    const doc = await res.json();
    const chunks = await prisma.documentChunk.findMany({ where: { documentId: doc.id } });
    expect(chunks.map((c) => c.content).join("\n")).not.toMatch(/[^\n]{200,}/);
    expect((await save.POST(post("/api/ai/study/adapt/save", { content: { mode: "x", doc: {} } }), undefined as never)).status).toBe(400);
  });
});
