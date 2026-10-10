// Integración real (BD + pgvector + pg-boss) de la ingesta en segundo plano, con
// embeddings simulados: no necesita Gemini. Se salta si no hay DATABASE_URL
// (job "check" de la CI); se ejecuta en el job E2E, que tiene PostgreSQL.
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

const HAS_DB = Boolean(process.env.DATABASE_URL);
const DIM = 768;

/** PDF mínimo válido con una línea de texto por página (solo ASCII). */
function makePdf(pages: string[]): Buffer {
  const objs: string[] = [];
  objs[1] = "<< /Type /Catalog /Pages 2 0 R >>";
  objs[2] = `<< /Type /Pages /Kids [${pages.map((_, i) => `${4 + i * 2} 0 R`).join(" ")}] /Count ${pages.length} >>`;
  objs[3] = "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>";
  pages.forEach((text, i) => {
    const page = 4 + i * 2;
    const stream = `BT /F1 11 Tf 40 720 Td (${text}) Tj ET`;
    objs[page] = `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 3 0 R >> >> /Contents ${page + 1} 0 R >>`;
    objs[page + 1] = `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`;
  });
  let out = "%PDF-1.4\n";
  const offsets: number[] = [];
  for (let n = 1; n < objs.length; n++) {
    offsets[n] = Buffer.byteLength(out, "latin1");
    out += `${n} 0 obj\n${objs[n]}\nendobj\n`;
  }
  const xref = Buffer.byteLength(out, "latin1");
  out += `xref\n0 ${objs.length}\n0000000000 65535 f \n`;
  for (let n = 1; n < objs.length; n++) out += `${String(offsets[n]).padStart(10, "0")} 00000 n \n`;
  out += `trailer\n<< /Size ${objs.length} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(out, "latin1");
}

const fakeEmbed = async (texts: string[]) => texts.map((_, i) => Array.from({ length: DIM }, (_, j) => (j === i % DIM ? 1 : 0)));
const deps = { embed: fakeEmbed, assertAllowed: async () => {}, embedModel: () => "fake@768" };

describe.skipIf(!HAS_DB)("ingesta de apuntes en segundo plano (BD real)", () => {
  // Importación diferida: sin DATABASE_URL no se carga Prisma.
  let prisma: typeof import("@/lib/prisma").prisma;
  let rag: typeof import("@/lib/ai/rag");
  let queue: typeof import("@/lib/jobs/queue");
  let userId: string;
  let dir: string;

  async function newDoc(name: string, buf: Buffer, mime = "application/pdf") {
    const file = path.join(dir, name);
    await writeFile(file, buf);
    return prisma.studyDocument.create({
      data: { userId, title: name, mimeType: mime, storagePath: file, sizeBytes: buf.length, status: "PENDING" },
    });
  }
  const chunkStats = async (documentId: string) => {
    const [r] = await prisma.$queryRaw<Array<{ total: bigint; sin_vector: bigint; max_page: number | null }>>`
      SELECT count(*) AS total, count(*) FILTER (WHERE embedding IS NULL) AS sin_vector, max(page) AS max_page
      FROM "DocumentChunk" WHERE "documentId" = ${documentId}`;
    return { total: Number(r.total), sinVector: Number(r.sin_vector), maxPage: r.max_page };
  };

  beforeAll(async () => {
    prisma = (await import("@/lib/prisma")).prisma;
    rag = await import("@/lib/ai/rag");
    queue = await import("@/lib/jobs/queue");
    dir = await mkdtemp(path.join(tmpdir(), "lifeos-ingest-"));
    const u = await prisma.user.create({ data: { email: `ingest-${Date.now()}@test.dev`, aiConsentAt: new Date() } });
    userId = u.id;
  });

  afterAll(async () => {
    await queue?.stopBoss();
    if (userId) await prisma.user.delete({ where: { id: userId } }); // documentos y fragmentos en cascada
    if (dir) await rm(dir, { recursive: true, force: true });
  });

  const book = Array.from(
    { length: 100 },
    (_, i) => `Pagina ${i + 1}. La fuerza maxima depende del reclutamiento de unidades motoras y de la frecuencia de disparo. `.repeat(8),
  );

  it("un PDF de 100 páginas termina en EMBEDDED con todos los fragmentos vectorizados", async () => {
    const doc = await newDoc("libro.pdf", makePdf(book));
    const done = await rag.processDocument(doc.id, deps);
    expect(done?.status).toBe("EMBEDDED");
    const s = await chunkStats(doc.id);
    expect(s.total).toBeGreaterThan(50);
    expect(s.sinVector).toBe(0);
    expect(s.maxPage).toBe(100);
  }, 60_000);

  it("si los embeddings fallan queda FAILED con el motivo; el reintento no duplica fragmentos", async () => {
    const doc = await newDoc("fallo.txt", Buffer.from("Apuntes de bioquimica. ".repeat(400)), "text/plain");
    await expect(
      rag.processDocument(doc.id, { ...deps, embed: async () => Promise.reject(new Error("Gemini no responde")) }),
    ).rejects.toThrow("Gemini no responde");
    const failed = await prisma.studyDocument.findUniqueOrThrow({ where: { id: doc.id } });
    expect(failed.status).toBe("FAILED");
    expect(failed.error).toContain("Gemini no responde");

    await rag.processDocument(doc.id, deps);
    const first = await chunkStats(doc.id);
    await prisma.studyDocument.update({ where: { id: doc.id }, data: { status: "FAILED" } });
    await rag.processDocument(doc.id, deps); // segundo reintento: mismos fragmentos, no el doble
    expect((await chunkStats(doc.id)).total).toBe(first.total);
  }, 60_000);

  it("si se retira el consentimiento antes de procesar, no se envía nada y queda FAILED", async () => {
    const doc = await newDoc("sin-permiso.txt", Buffer.from("Texto privado. ".repeat(50)), "text/plain");
    let sent = false;
    await expect(
      rag.processDocument(doc.id, {
        ...deps,
        assertAllowed: async () => Promise.reject(new Error("Activa el consentimiento de IA")),
        embed: async (t) => ((sent = true), fakeEmbed(t)),
      }),
    ).rejects.toThrow();
    expect(sent).toBe(false);
    expect((await prisma.studyDocument.findUniqueOrThrow({ where: { id: doc.id } })).status).toBe("FAILED");
  });

  it("la cola pg-boss procesa un documento encolado", async () => {
    const doc = await newDoc("cola.pdf", makePdf(book.slice(0, 10)));
    // Cola propia: si hay un servidor de Atlenza en marcha contra la misma BD, su
    // trabajador no debe llevarse este documento (lo procesaría con Gemini real).
    const q = `ingest-test-${Date.now()}`;
    await queue.startIngestWorker(deps, q);
    await queue.enqueueIngest(doc.id, q);
    let status = "PENDING";
    for (let i = 0; i < 60 && status !== "EMBEDDED" && status !== "FAILED"; i++) {
      await new Promise((r) => setTimeout(r, 500));
      status = (await prisma.studyDocument.findUniqueOrThrow({ where: { id: doc.id } })).status;
    }
    expect(status).toBe("EMBEDDED");
    expect((await chunkStats(doc.id)).maxPage).toBe(10);
  }, 60_000);
});
