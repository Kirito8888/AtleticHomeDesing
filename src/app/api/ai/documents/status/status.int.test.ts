// v2.8.0 B4 · O9 · estado ligero de apuntes para el sondeo de /study: una consulta, solo lo propio, tope de ids.
import { NextRequest } from "next/server";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { testStamp } from "@/test/stamp";

let current = { id: "", role: "ATHLETE" as const };
vi.mock("@/auth", () => ({ auth: async () => null }));
vi.mock("@/lib/auth/session", async (orig) => ({ ...(await orig<typeof import("@/lib/auth/session")>()), requireUser: async () => current }));

const counter = { n: 0, on: false };
vi.mock("@/lib/prisma", async () => {
  const { PrismaPg } = await import("@prisma/adapter-pg");
  const { PrismaClient } = await import("@/generated/prisma/client");
  const base = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL!, max: 5 }) });
  return {
    prisma: base.$extends({
      query: {
        $allModels: {
          async $allOperations({ args, query }) {
            if (counter.on) counter.n++;
            return query(args);
          },
        },
      },
    }),
  };
});

const HAS_DB = Boolean(process.env.DATABASE_URL);

describe.skipIf(!HAS_DB)("GET /api/ai/documents/status (BD real)", () => {
  let prisma: typeof import("@/lib/prisma").prisma;
  let GET: typeof import("./route").GET;
  const t = testStamp();
  let me = "";
  let other = "";
  const mine: string[] = [];
  let theirs = "";

  const call = async (ids: string) => {
    counter.n = 0;
    counter.on = true;
    try {
      const res = await GET(new NextRequest(`http://localhost/api/ai/documents/status?ids=${ids}`), { params: Promise.resolve({}) } as never);
      return { res, body: await res.json() };
    } finally {
      counter.on = false;
    }
  };

  beforeAll(async () => {
    process.env.AUTH_SECRET ??= "secreto-auth-de-prueba";
    prisma = (await import("@/lib/prisma")).prisma;
    GET = (await import("./route")).GET;
    me = (await prisma.user.create({ data: { email: `st-${t}@test.dev` } })).id;
    other = (await prisma.user.create({ data: { email: `st2-${t}@test.dev` } })).id;
    current = { id: me, role: "ATHLETE" };
    const mk = (userId: string, status: "PROCESSING" | "EMBEDDED" | "FAILED", error?: string) =>
      prisma.studyDocument.create({ data: { userId, title: "Apuntes", mimeType: "text/plain", storagePath: "", sizeBytes: 1, status, error: error ?? null } }).then((d) => d.id);
    mine.push(await mk(me, "PROCESSING"), await mk(me, "EMBEDDED"), await mk(me, "FAILED", "fallo interno con /ruta/secreta"));
    theirs = await mk(other, "PROCESSING");
    await prisma.documentChunk.create({ data: { documentId: mine[1], userId: me, chunkIndex: 0, content: "x" } });
  });
  afterAll(async () => {
    await prisma.user.deleteMany({ where: { email: { contains: `-${t}@test.dev` } } });
  });

  it("devuelve estado y recuentos de lo propio, sin ajenos, con una sola consulta", async () => {
    const { res, body } = await call([...mine, theirs].join(","));
    expect(res.status).toBe(200);
    expect(body.map((d: { id: string }) => d.id).sort()).toEqual([...mine].sort());
    const done = body.find((d: { id: string }) => d.id === mine[1]);
    expect(done).toMatchObject({ status: "EMBEDDED", chunks: 1, flashcards: 0 });
    expect(body.find((d: { id: string }) => d.id === mine[0]).status).toBe("PROCESSING");
    expect(JSON.stringify(body)).not.toContain("/ruta/secreta"); // error pasa por publicDocError
    expect(counter.n).toBe(1);
  });

  it("mismas consultas con 1 que con 40 ids; vacío no consulta; más de 50 → 400", async () => {
    const one = await call(mine[0]);
    const q1 = counter.n;
    const many = await call(Array.from({ length: 40 }, (_, i) => (i < 3 ? mine[i] : `nope${i}`)).join(","));
    expect(counter.n).toBe(q1);
    expect(one.body).toHaveLength(1);
    expect(many.body).toHaveLength(3);
    expect((await call("")).body).toEqual([]);
    expect(counter.n).toBe(0);
    expect((await call(Array.from({ length: 51 }, (_, i) => `i${i}`).join(","))).res.status).toBe(400);
  });
});
