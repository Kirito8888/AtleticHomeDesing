// v2.5 · Estudio B14: cuota de 5 GB de apuntes por atleta (BD real). La suma pasa de 2³¹ bytes.
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/ai/guard", () => ({ assertAiAllowed: async () => {} }));

const HAS_DB = Boolean(process.env.DATABASE_URL);
const LIMIT = 5 * 1024 ** 3;
// Int de Postgres llega a 2.147.483.647: se reparte en varios documentos
const seed = async (prisma: typeof import("@/lib/prisma").prisma, userId: string, total: number) => {
  const parts: number[] = [];
  for (let left = total; left > 0; left -= 2_000_000_000) parts.push(Math.min(left, 2_000_000_000));
  await prisma.studyDocument.createMany({ data: parts.map((sizeBytes, i) => ({ userId, title: `Relleno ${i}`, mimeType: "text/plain", storagePath: "", sizeBytes, status: "EMBEDDED" as const })) });
};

describe.skipIf(!HAS_DB)("cuota de apuntes (BD real)", () => {
  let prisma: typeof import("@/lib/prisma").prisma;
  let rag: typeof import("@/lib/ai/rag");
  let ok: string;
  let over: string;
  const t = Date.now();
  const file = () => new File(["Apuntes de prueba\n"], "nota.txt", { type: "text/plain" });

  beforeAll(async () => {
    process.env.AUTH_SECRET ??= "secreto-auth-de-prueba";
    process.env.UPLOAD_QUOTA_MB = "5120";
    prisma = (await import("@/lib/prisma")).prisma;
    rag = await import("@/lib/ai/rag");
    ok = (await prisma.user.create({ data: { email: `q1-${t}@test.dev`, name: "A" } })).id;
    over = (await prisma.user.create({ data: { email: `q2-${t}@test.dev`, name: "B" } })).id;
    await seed(prisma, ok, Math.round(4.99 * 1024 ** 3));
    await seed(prisma, over, Math.round(5.01 * 1024 ** 3));
  });
  afterAll(async () => {
    await prisma.user.deleteMany({ where: { id: { in: [ok, over] } } });
  });

  it("suma más de 2³¹ bytes sin desbordar y respeta el tope de 5 GB", async () => {
    const u = await rag.studyStorageUsage(ok);
    expect(u.used).toBe(Math.round(4.99 * 1024 ** 3));
    expect(u.limit).toBe(LIMIT);
  });

  it("4,99 GB usados: se puede subir un fichero pequeño", async () => {
    const doc = await rag.createDocumentFromUpload(ok, file(), {});
    expect(doc.status).toBe("PENDING");
  });

  it("5,01 GB usados: 413 con mensaje claro y sin crear nada", async () => {
    const before = await prisma.studyDocument.count({ where: { userId: over } });
    await expect(rag.createDocumentFromUpload(over, file(), {})).rejects.toMatchObject({ status: 413, message: expect.stringMatching(/límite de .*GB.*Borra apuntes/) });
    expect(await prisma.studyDocument.count({ where: { userId: over } })).toBe(before);
  });

  it("guardar un informe también respeta la cuota", async () => {
    await expect(rag.createDocumentFromText(over, { title: "Informe", markdown: "# Informe\n\nTexto" })).rejects.toMatchObject({ status: 413 });
  });
});
