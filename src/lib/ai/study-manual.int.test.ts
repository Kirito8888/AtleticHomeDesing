// v2.5 · Estudio B17: manual práctico en PDF. Ruta autenticada, propiedad del apunte, PDF real con IA simulada.
import { existsSync } from "node:fs";
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
    return { model: "modelo-de-prueba", data: schema.parse({ title: "Manual de redes", sections: [{ name: "Servicios", recipes: [{ title: "Abrir el puerto web", steps: ["Editar la regla"], commands: ["ufw allow 80"], keywords: ["firewall"] }] }] }) };
  },
}));

const HAS_DB = Boolean(process.env.DATABASE_URL);
const HAS_CHROMIUM = Boolean(process.env.CHROMIUM_PATH) || existsSync("/opt/pw-browsers");
const post = (body: unknown) => new NextRequest("http://localhost/api/study/manual", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });

describe.skipIf(!HAS_DB)("manual práctico (BD real)", () => {
  let prisma: typeof import("@/lib/prisma").prisma;
  let r: typeof import("@/app/api/study/manual/route");
  let me: string;
  let other: string;
  let otherDoc: string;
  const t = Date.now();

  beforeAll(async () => {
    process.env.AUTH_SECRET ??= "secreto-auth-de-prueba";
    prisma = (await import("@/lib/prisma")).prisma;
    r = await import("@/app/api/study/manual/route");
    me = (await prisma.user.create({ data: { email: `man-${t}@test.dev`, name: "Atleta", aiConsentAt: new Date() } })).id;
    other = (await prisma.user.create({ data: { email: `man2-${t}@test.dev`, name: "Otra" } })).id;
    current = { id: me, role: "ATHLETE" };
    otherDoc = (await prisma.studyDocument.create({ data: { userId: other, title: "Ajeno", mimeType: "text/markdown", storagePath: "", sizeBytes: 10, status: "EMBEDDED", embedModel: "texto" } })).id;
  });
  afterAll(async () => {
    await prisma.user.deleteMany({ where: { id: { in: [me, other] } } });
  });

  it("apunte ajeno 404 y cuerpo inválido 400, sin llamar a la IA", async () => {
    seenPrompt = "";
    expect((await r.POST(post({ source: { kind: "document", documentId: otherDoc } }), undefined as never)).status).toBe(404);
    expect((await r.POST(post({ source: { kind: "text", text: "corto" } }), undefined as never)).status).toBe(400);
    expect(seenPrompt).toBe("");
  });

  it.skipIf(!HAS_CHROMIUM)("devuelve un PDF descargable con el índice paginado", async () => {
    const text = "Para abrir el puerto web en el servidor se edita la regla del cortafuegos con ufw allow 80 y se comprueba el estado.";
    const res = await r.POST(post({ source: { kind: "text", text } }), undefined as never);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("application/pdf");
    expect(res.headers.get("content-disposition")).toMatch(/attachment; filename="manual-practico-manual-de-redes\.pdf"/);
    expect(seenPrompt).toContain("ufw allow 80");
    const buf = Buffer.from(await res.arrayBuffer());
    expect(buf.subarray(0, 5).toString()).toBe("%PDF-");
    const { getDocumentProxy } = await import("unpdf");
    const doc = await getDocumentProxy(new Uint8Array(buf));
    expect(doc.numPages).toBeGreaterThanOrEqual(4);
  }, 90_000);
});
