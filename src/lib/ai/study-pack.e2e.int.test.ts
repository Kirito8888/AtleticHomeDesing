// v2.6 · Extremo a extremo del paquete con ficheros de ejemplo (PDF y PPTX generados en el test): subida → extracción → troceado →
// paquete (IA simulada por el mismo camino que una real) → resumen validado, preguntas ancladas y juego servido sin llamar a la IA.
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { NextRequest } from "next/server";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { buildPptxForTest } from "./pptx-fixture";
import { buildPdf } from "@/test/pdf-fixture";

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
const PDF_PAGES = [
  [
    { x: 50, y: 760, size: 14, text: "Tema 3 - Usuarios y grupos" },
    { x: 50, y: 730, text: "El comando useradd crea usuarios nuevos en el sistema operativo." },
    { x: 50, y: 710, text: "El fichero /etc/passwd guarda la lista de cuentas de usuario." },
    { x: 50, y: 690, text: "$ useradd -m ana" },
    { x: 50, y: 670, text: "$ passwd ana" },
  ],
  [
    { x: 50, y: 760, text: "El comando userdel elimina una cuenta de usuario del sistema." },
    { x: 50, y: 740, text: "Los grupos secundarios se gestionan con el comando usermod." },
    { x: 50, y: 720, text: "$ userdel -r ana" },
  ],
];
const PPTX_SLIDES = [
  { text: ["Permisos de ficheros", "El comando chmod cambia los permisos de un fichero.", "$ chmod 640 informe.txt"], notes: "Recordar que 640 es rw-r-----" },
  { text: ["Propietario", "El comando chown cambia el propietario de un fichero.", "$ chown ana informe.txt"] },
];

describe.skipIf(!HAS_DB)("paquete extremo a extremo con PDF y PPTX (BD real)", () => {
  let prisma: typeof import("@/lib/prisma").prisma;
  let rag: typeof import("@/lib/ai/rag");
  let sp: typeof import("@/lib/ai/study-pack");
  let quest: typeof import("@/app/api/ai/study/quest/route");
  let me: string;
  let mod: string;
  let dir: string;
  const t = Date.now();
  const deps = { embed: async () => null, assertAllowed: async () => {} };

  const ingest = async (name: string, buf: Buffer, mime: string) => {
    const file = path.join(dir, name);
    await writeFile(file, buf);
    const doc = await prisma.studyDocument.create({ data: { userId: me, moduleId: mod, title: name, mimeType: mime, storagePath: file, sizeBytes: buf.length, status: "PENDING" } });
    await rag.processDocument(doc.id, deps);
    return prisma.studyDocument.findUniqueOrThrow({ where: { id: doc.id } });
  };

  beforeAll(async () => {
    process.env.AUTH_SECRET ??= "secreto-auth-de-prueba";
    process.env.LIFEOS_FAKE_AI = "1";
    prisma = (await import("@/lib/prisma")).prisma;
    rag = await import("@/lib/ai/rag");
    sp = await import("@/lib/ai/study-pack");
    quest = await import("@/app/api/ai/study/quest/route");
    dir = await mkdtemp(path.join(tmpdir(), "lifeos-pack-"));
    me = (await prisma.user.create({ data: { email: `pke-${t}@test.dev`, name: "A", aiConsentAt: new Date() } })).id;
    current = { id: me, role: "ATHLETE" };
    mod = (await prisma.studyModule.create({ data: { userId: me, name: "ASO" } })).id;
  });
  afterAll(async () => {
    await prisma.user.deleteMany({ where: { id: me } });
  });

  it("un PDF se extrae, se trocea y genera un paquete cuyas preguntas están ancladas en el PDF", async () => {
    const pdf = await ingest("tema3.pdf", Buffer.from(buildPdf(PDF_PAGES)), "application/pdf");
    expect(pdf.status).toBe("EMBEDDED");
    const topic = await prisma.studyTopic.create({ data: { userId: me, moduleId: mod, name: "Usuarios", tag: "red", documentId: pdf.id } });
    await prisma.studyModule.update({ where: { id: mod }, data: { examFormat: { theory: true, practical: true, test: true, essay: true, minutes: 30, questions: 12 } } });

    await sp.preparePack(me, topic.id);
    await sp.runPack(me, topic.id, {}, { sleep: async () => {}, minIntervalMs: 0 });
    const pack = await sp.getPack(me, topic.id);
    expect(pack?.status).toBe("READY");
    expect(pack?.summary?.levels.safe.length).toBeGreaterThan(0);
    expect(pack?.summary?.tenMinutes).toHaveLength(5);

    const items = await sp.packItems(me, topic.id);
    const text = (await prisma.documentChunk.findMany({ where: { documentId: pdf.id }, select: { content: true } })).map((c) => c.content).join("\n");
    expect(items.some((i) => i.type === "t")).toBe(true);
    expect(items.some((i) => i.type === "e")).toBe(true); // el formato pidió desarrollo
    for (const i of items.filter((x) => x.type === "p")) expect(text).toContain(i.p!.sol);
    // Todo el contenido lo ha validado el esquema: round-trip por la API del juego.
    const res = await quest.POST(new NextRequest("http://localhost/api/ai/study/quest", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ moduleId: mod, nodeId: topic.id }) }), undefined as never);
    const j = await res.json();
    expect(j.source).toBe("pack");
    expect(j.items.length).toBe(items.length);
  });

  it("un PPTX (con notas) entra por el mismo camino y su paquete suma al examen final", async () => {
    const pptx = await ingest("tema4.pptx", buildPptxForTest(PPTX_SLIDES), "application/vnd.openxmlformats-officedocument.presentationml.presentation");
    expect(pptx.status).toBe("EMBEDDED");
    const chunks = (await prisma.documentChunk.findMany({ where: { documentId: pptx.id }, select: { content: true } })).map((c) => c.content).join("\n");
    expect(chunks).toContain("Diapositiva 1");
    expect(chunks).toContain("chmod");
    expect(chunks).toContain("Notas: Recordar que 640");
    const topic = await prisma.studyTopic.create({ data: { userId: me, moduleId: mod, name: "Permisos", tag: "yellow", documentId: pptx.id } });
    await sp.preparePack(me, topic.id);
    await sp.runPack(me, topic.id, {}, { sleep: async () => {}, minIntervalMs: 0 });
    expect((await sp.getPack(me, topic.id))?.status).toBe("READY");

    const fin = await (await quest.POST(new NextRequest("http://localhost/api/ai/study/quest", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ moduleId: mod, nodeId: "final" }) }), undefined as never)).json();
    expect(fin.source).toBe("pack");
    expect(fin.minutes).toBe(30);
    expect(fin.items.length).toBeLessThanOrEqual(12);
    const themes = new Set(fin.items.map((i: { lid: string }) => i.lid));
    expect(themes.size).toBe(2); // mezcla de los dos temas
  });

  it("un PDF/PPTX corrupto falla con un motivo, sin dejar el documento a medias", async () => {
    const bad = await prisma.studyDocument.create({ data: { userId: me, moduleId: mod, title: "roto.pptx", mimeType: "application/vnd.openxmlformats-officedocument.presentationml.presentation", storagePath: path.join(dir, "roto.pptx"), sizeBytes: 4, status: "PENDING" } });
    await writeFile(path.join(dir, "roto.pptx"), Buffer.from("PK\u0003\u0004 no es un zip de verdad"));
    await expect(rag.processDocument(bad.id, deps)).rejects.toThrow();
    const after = await prisma.studyDocument.findUniqueOrThrow({ where: { id: bad.id } });
    expect(after.status).toBe("FAILED");
  });
});
