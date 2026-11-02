// v2.6 · Progreso del Modo Juego por usuaria en BD, con control de versión y aislamiento.
import { NextRequest } from "next/server";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

let current = { id: "", role: "ATHLETE" as const };
vi.mock("@/auth", () => ({ auth: async () => null }));
vi.mock("@/lib/auth/session", async (orig) => ({ ...(await orig<typeof import("@/lib/auth/session")>()), requireUser: async () => current }));

const HAS_DB = Boolean(process.env.DATABASE_URL);
const put = (id: string, body: unknown) => new NextRequest(`http://localhost/api/study/quest-progress/${id}`, { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
const get = (id: string) => new NextRequest(`http://localhost/api/study/quest-progress/${id}`);

describe.skipIf(!HAS_DB)("progreso del juego (BD real)", () => {
  let prisma: typeof import("@/lib/prisma").prisma;
  let r: typeof import("@/app/api/study/quest-progress/[moduleId]/route");
  let me: string;
  let other: string;
  let mod: string;
  let otherMod: string;
  const t = Date.now();
  const ctx = (id: string) => ({ params: Promise.resolve({ moduleId: id }) }) as never;

  beforeAll(async () => {
    process.env.AUTH_SECRET ??= "secreto-auth-de-prueba";
    prisma = (await import("@/lib/prisma")).prisma;
    r = await import("@/app/api/study/quest-progress/[moduleId]/route");
    me = (await prisma.user.create({ data: { email: `qp-${t}@test.dev`, name: "A" } })).id;
    other = (await prisma.user.create({ data: { email: `qp2-${t}@test.dev`, name: "B" } })).id;
    mod = (await prisma.studyModule.create({ data: { userId: me, name: "ASO" } })).id;
    otherMod = (await prisma.studyModule.create({ data: { userId: other, name: "Ajena" } })).id;
    current = { id: me, role: "ATHLETE" };
  });
  afterAll(async () => {
    await prisma.user.deleteMany({ where: { id: { in: [me, other] } } });
  });

  it("sin nada guardado: state null y versión 0", async () => {
    const j = await (await r.GET(get(mod), ctx(mod))).json();
    expect(j).toEqual({ state: null, version: 0 });
  });
  it("crea con versión 0 → 1 y actualiza con la versión vista", async () => {
    const a = await r.PUT(put(mod, { baseVersion: 0, state: { xp: 10, lv: { t1: { stars: 2, best: 80 } }, fails: ["x"], free: false } }), ctx(mod));
    expect(a.status).toBe(200);
    expect((await a.json()).version).toBe(1);
    const b = await r.PUT(put(mod, { baseVersion: 1, state: { xp: 30, lv: {}, fails: [], free: false } }), ctx(mod));
    expect((await b.json()).version).toBe(2);
    expect((await (await r.GET(get(mod), ctx(mod))).json()).state.xp).toBe(30);
  });
  it("conflicto 409 con el estado actual cuando la versión está desfasada", async () => {
    const res = await r.PUT(put(mod, { baseVersion: 1, state: { xp: 1, lv: {}, fails: [], free: false } }), ctx(mod));
    expect(res.status).toBe(409);
    const j = await res.json();
    expect(j.details.version).toBe(2);
    expect(j.details.state.xp).toBe(30);
    const again = await r.PUT(put(mod, { baseVersion: 0, state: { xp: 1, lv: {}, fails: [], free: false } }), ctx(mod));
    expect(again.status).toBe(409); // ya existe: no se puede «crear» otra vez
  });
  it("sanea lo que llega (estrellas fuera de rango, basura)", async () => {
    const res = await r.PUT(put(mod, { baseVersion: 2, state: { xp: 5, lv: { a: { stars: 99 } }, fails: [3], free: "sí", extra: "no" } }), ctx(mod));
    expect((await res.json()).state).toEqual({ xp: 5, lv: { a: { stars: 3 } }, fails: [], free: false });
  });
  it("aislamiento: no se lee ni se escribe el de otra usuaria", async () => {
    expect((await r.GET(get(otherMod), ctx(otherMod))).status).toBe(404);
    expect((await r.PUT(put(otherMod, { baseVersion: 0, state: {} }), ctx(otherMod))).status).toBe(404);
    expect(await prisma.questProgress.count({ where: { moduleId: otherMod } })).toBe(0);
  });
  it("body inválido → 400", async () => {
    expect((await r.PUT(put(mod, { baseVersion: -1, state: {} }), ctx(mod))).status).toBe(400);
  });
});
