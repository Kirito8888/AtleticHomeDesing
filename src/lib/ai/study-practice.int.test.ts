// Estudio · Práctica guiada: generar y corregir con IA (simulada). No escribe nada; las líneas citadas son las reales.
import { NextRequest } from "next/server";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { testStamp } from "@/test/stamp";

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
    const data = p.prompt.includes("CÓDIGO DEL ALUMNO")
      ? { verdict: "correct", summary: "Bien.", lines: [{ line: 2, kind: "error", comment: "Falta el punto y coma." }, { line: 50, kind: "ok", comment: "no existe" }], steps: ["Añade ;"] }
      : { exercises: [{ topic: "Arrays", title: "Recorrer", statement: "Recorre un array con foreach.", solution: "<?php foreach($a as $x){echo $x;}", hints: ["Piensa en foreach."], evidence: "Usa foreach para recorrer arrays en PHP" }] };
    return { model: "modelo-de-prueba", data: schema.parse(data) };
  },
}));

const HAS_DB = Boolean(process.env.DATABASE_URL);
const post = (path: string, body: unknown) => new NextRequest(`http://localhost/api/ai/study/${path}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });

describe.skipIf(!HAS_DB)("práctica guiada (BD real)", () => {
  let prisma: typeof import("@/lib/prisma").prisma;
  let gen: typeof import("@/app/api/ai/study/practice/route");
  let rev: typeof import("@/app/api/ai/study/practice/review/route");
  let me: string;
  let other: string;
  let mod: string;
  let emptyMod: string;
  let otherMod: string;
  let docA: string;
  let docB: string;
  let otherDoc: string;
  const t = testStamp();
  const counts = async () => ({
    docs: await prisma.studyDocument.count({ where: { userId: me } }),
    chunks: await prisma.documentChunk.count({ where: { userId: me } }),
    topics: await prisma.studyTopic.count({ where: { userId: me } }),
    cards: await prisma.flashcard.count({ where: { deck: { userId: me } } }),
  });
  const mkDoc = async (userId: string, moduleId: string, title: string, content: string) => {
    const d = await prisma.studyDocument.create({ data: { userId, moduleId, title, mimeType: "text/markdown", storagePath: "", sizeBytes: 10, status: "EMBEDDED", embedModel: "texto" } });
    await prisma.documentChunk.create({ data: { documentId: d.id, userId, chunkIndex: 0, content } });
    return d.id;
  };

  beforeAll(async () => {
    process.env.AUTH_SECRET ??= "secreto-auth-de-prueba";
    prisma = (await import("@/lib/prisma")).prisma;
    gen = await import("@/app/api/ai/study/practice/route");
    rev = await import("@/app/api/ai/study/practice/review/route");
    me = (await prisma.user.create({ data: { email: `prc-${t}@test.dev`, name: "Atleta", aiConsentAt: new Date() } })).id;
    other = (await prisma.user.create({ data: { email: `prc2-${t}@test.dev`, name: "Otra" } })).id;
    current = { id: me, role: "ATHLETE" };
    mod = (await prisma.studyModule.create({ data: { userId: me, name: "PHP" } })).id;
    emptyMod = (await prisma.studyModule.create({ data: { userId: me, name: "Vacía" } })).id;
    otherMod = (await prisma.studyModule.create({ data: { userId: other, name: "Ajena" } })).id;
    docA = await mkDoc(me, mod, "Arrays", "PHP arrays: Usa foreach para recorrer arrays en PHP.");
    docB = await mkDoc(me, mod, "Bucles", "Bucles while: SOLO-EN-DOCB repite mientras se cumpla.");
    otherDoc = await mkDoc(other, otherMod, "Ajeno", "SECRETO-AJENO");
  });
  afterAll(async () => {
    await prisma.user.deleteMany({ where: { id: { in: [me, other] } } });
  });

  it("genera sobre los apuntes elegidos, verifica la cita y no escribe nada", async () => {
    const before = await counts();
    const res = await gen.POST(post("practice", { moduleId: mod, count: 3, documentIds: [docA] }), undefined as never);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.exercises).toHaveLength(1);
    expect(body.exercises[0].verified).toBe(true);
    expect(seenPrompt).toMatch(/foreach para recorrer/);
    expect(seenPrompt).not.toMatch(/SOLO-EN-DOCB/);
    expect(await counts()).toEqual(before);
    await gen.POST(post("practice", { moduleId: mod }), undefined as never);
    expect(seenPrompt).toMatch(/SOLO-EN-DOCB/);
  });

  it("corrige: solo líneas reales, con el texto del servidor y sin escribir", async () => {
    const before = await counts();
    const answer = "<?php\necho 1";
    const res = await rev.POST(post("practice/review", { moduleId: mod, exercise: { title: "t", statement: "e", solution: "s" }, answer }), undefined as never);
    expect(res.status).toBe(200);
    const { review } = await res.json();
    expect(review.lines).toEqual([{ line: 2, code: "echo 1", kind: "error", comment: "Falta el punto y coma." }]);
    expect(review.verdict).toBe("partial");
    expect(seenPrompt).toMatch(/2\| echo 1/);
    expect(await counts()).toEqual(before);
  });

  it("errores: ajena 404, documentos ajenos o sin apuntes 409, cuerpo inválido 400", async () => {
    expect((await gen.POST(post("practice", { moduleId: otherMod }), undefined as never)).status).toBe(404);
    expect((await gen.POST(post("practice", { moduleId: mod, documentIds: [otherDoc] }), undefined as never)).status).toBe(409);
    expect((await gen.POST(post("practice", { moduleId: emptyMod }), undefined as never)).status).toBe(409);
    expect((await gen.POST(post("practice", { moduleId: mod, count: 9 }), undefined as never)).status).toBe(400);
    expect((await rev.POST(post("practice/review", { moduleId: otherMod, exercise: { title: "t", statement: "e", solution: "s" }, answer: "x" }), undefined as never)).status).toBe(404);
    expect((await rev.POST(post("practice/review", { moduleId: mod, exercise: { title: "t", statement: "e", solution: "s" }, answer: "" }), undefined as never)).status).toBe(400);
    expect(docB).toBeTruthy();
  });
});
