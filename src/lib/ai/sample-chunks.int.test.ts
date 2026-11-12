// v2.11 B4-A · O20: el muestreo en la BD elige lo mismo que `sampleChunks` en memoria, sin traer todo el contenido.
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("@/auth", () => ({ auth: async () => null }));

const HAS_DB = Boolean(process.env.DATABASE_URL);

describe.skipIf(!HAS_DB)("loadSampledChunks (BD real)", () => {
  let prisma: typeof import("@/lib/prisma").prisma;
  let fc: typeof import("./flashcards");
  const t = Date.now();
  let me: string;
  let other: string;
  let docBig: string;
  let docSmall: string;
  let docOther: string;
  const bigTexts = Array.from({ length: 120 }, (_, i) => `B${i}:`.padEnd(1_000 + (i % 7) * 100, "x")); // ≈ 120 000 car. > 40 000
  const smallTexts = ["uno", "dos", "tres"];

  const mkDoc = (userId: string, title: string, texts: string[], createdAt: Date) =>
    prisma.studyDocument
      .create({
        data: {
          userId, title, mimeType: "text/plain", storagePath: "", sizeBytes: 1, status: "EMBEDDED", embedModel: "texto", createdAt,
          chunks: { create: texts.map((content, chunkIndex) => ({ userId, chunkIndex, content })) },
        },
      })
      .then((d) => d.id);

  beforeAll(async () => {
    prisma = (await import("@/lib/prisma")).prisma;
    fc = await import("./flashcards");
    me = (await prisma.user.create({ data: { email: `o20-a-${t}@test.dev`, name: "A" } })).id;
    other = (await prisma.user.create({ data: { email: `o20-b-${t}@test.dev`, name: "B" } })).id;
    docBig = await mkDoc(me, "Grande", bigTexts, new Date(t - 2000));
    docSmall = await mkDoc(me, "Pequeño", smallTexts, new Date(t - 1000));
    docOther = await mkDoc(other, "Ajeno", ["secreto ajeno"], new Date(t));
  });
  afterAll(async () => {
    await prisma.user.deleteMany({ where: { id: { in: [me, other].filter(Boolean) } } });
  });

  it("un documento grande: la misma selección que sampleChunks en memoria, y dentro del límite", async () => {
    const got = (await fc.loadSampledChunks(me, [docBig])).map((c) => c.content);
    const expected = fc.sampleChunks(bigTexts.map((content) => ({ content }))).map((c) => c.content);
    expect(got).toEqual(expected);
    expect(got.length).toBeLessThan(bigTexts.length);
    expect(got.join("").length).toBeLessThanOrEqual(fc.MAX_SOURCE_CHARS);
  });

  it("varios documentos: por fecha de alta y chunkIndex; lo pequeño se devuelve entero", async () => {
    const small = (await fc.loadSampledChunks(me, [docSmall])).map((c) => c.content);
    expect(small).toEqual(smallTexts);
    const both = (await fc.loadSampledChunks(me, [docSmall, docBig])).map((c) => c.content);
    const expected = fc.sampleChunks([...bigTexts, ...smallTexts].map((content) => ({ content }))).map((c) => c.content);
    expect(both).toEqual(expected); // el grande es más antiguo → va primero, aunque se pida después
  });

  it("aislamiento: documentos ajenos o inexistentes no devuelven nada", async () => {
    expect(await fc.loadSampledChunks(me, [docOther])).toEqual([]);
    expect(await fc.loadSampledChunks(other, [docBig])).toEqual([]);
    expect(await fc.loadSampledChunks(me, [])).toEqual([]);
    expect((await fc.loadSampledChunks(me, [docSmall, docOther])).map((c) => c.content)).toEqual(smallTexts);
  });

  it("sampleBy es la misma regla con longitudes", () => {
    const items = Array.from({ length: 10 }, (_, i) => ({ i, len: 10 }));
    expect(fc.sampleBy(items, (x) => x.len, 1_000)).toBe(items);
    expect(fc.sampleBy(items, (x) => x.len, 50).map((x) => x.i)).toEqual([0, 2, 4, 6, 8]);
  });
});
