// v2.9 · Histórico de autoevaluación y micro-pasos en BD: idempotencia, aislamiento por usuaria y cascada.
import { NextRequest } from "next/server";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

let current = { id: "", role: "ATHLETE" as const };
vi.mock("@/auth", () => ({ auth: async () => null }));
vi.mock("@/lib/auth/session", async (orig) => ({ ...(await orig<typeof import("@/lib/auth/session")>()), requireUser: async () => current }));

const HAS_DB = Boolean(process.env.DATABASE_URL);
const req = (url: string, method: string, body?: unknown) => new NextRequest(`http://localhost${url}`, { method, headers: { "content-type": "application/json" }, body: body ? JSON.stringify(body) : undefined });

describe.skipIf(!HAS_DB)("histórico de estudio (BD real)", () => {
  let prisma: typeof import("@/lib/prisma").prisma;
  let st: typeof import("@/app/api/study/self-test-history/[moduleId]/route");
  let ms: typeof import("@/app/api/study/micro-sessions/route");
  let me: string;
  let other: string;
  let mod: string;
  let otherMod: string;
  const t = Date.now();
  const ctx = (id: string) => ({ params: Promise.resolve({ moduleId: id }) }) as never;
  const attempt = (over: object = {}) => ({ takenAt: "2026-11-01T10:00:00.000Z", score: 7.5, label: "Cerca del 10", weak: ["Redes"], ...over });
  const micro = (over: object = {}) => ({ clientKey: "k-1", title: "Tema", steps: [{ n: 1, action: "a", minutes: 5 }], stepsDone: 1, focusMin: 15, restMin: 3, completedAt: "2026-11-01T10:00:00.000Z", ...over });

  beforeAll(async () => {
    process.env.AUTH_SECRET ??= "secreto-auth-de-prueba";
    prisma = (await import("@/lib/prisma")).prisma;
    st = await import("@/app/api/study/self-test-history/[moduleId]/route");
    ms = await import("@/app/api/study/micro-sessions/route");
    me = (await prisma.user.create({ data: { email: `sh-${t}@test.dev`, name: "A" } })).id;
    other = (await prisma.user.create({ data: { email: `sh2-${t}@test.dev`, name: "B" } })).id;
    mod = (await prisma.studyModule.create({ data: { userId: me, name: "ASO" } })).id;
    otherMod = (await prisma.studyModule.create({ data: { userId: other, name: "Ajena" } })).id;
    current = { id: me, role: "ATHLETE" };
  });
  afterAll(async () => {
    await prisma.user.deleteMany({ where: { id: { in: [me, other] } } });
  });

  it("guarda, lee y reenviar el mismo intento no duplica (200 las dos veces)", async () => {
    const body = { attempts: [attempt({ questions: 8, answers: [{ topic: "Redes", tag: "red", score: 0.5 }] })] };
    const r1 = await st.POST(req(`/api/study/self-test-history/${mod}`, "POST", body), ctx(mod));
    expect(r1.status).toBe(200);
    const r2 = await st.POST(req(`/api/study/self-test-history/${mod}`, "POST", { attempts: [attempt({ imported: true })] }), ctx(mod));
    expect(r2.status).toBe(200);
    const j = await (await st.GET(req(`/api/study/self-test-history/${mod}`, "GET"), ctx(mod))).json();
    expect(j.attempts).toHaveLength(1);
    expect(j.attempts[0]).toMatchObject({ score: 7.5, questions: 8, imported: false, weak: ["Redes"] });
  });

  it("importa varios intentos antiguos de una vez, del más reciente al más antiguo", async () => {
    await st.POST(req(`/api/study/self-test-history/${mod}`, "POST", { attempts: [attempt({ takenAt: "2026-10-01T10:00:00.000Z", score: 4, imported: true }), attempt({ takenAt: "2026-11-05T10:00:00.000Z", score: 9 })] }), ctx(mod));
    const j = await (await st.GET(req(`/api/study/self-test-history/${mod}`, "GET"), ctx(mod))).json();
    expect(j.attempts.map((a: { score: number }) => a.score)).toEqual([9, 7.5, 4]);
  });

  it("aislamiento: asignatura ajena = 404 en GET y POST y no se escribe nada", async () => {
    expect((await st.GET(req(`/api/study/self-test-history/${otherMod}`, "GET"), ctx(otherMod))).status).toBe(404);
    expect((await st.POST(req(`/api/study/self-test-history/${otherMod}`, "POST", { attempts: [attempt()] }), ctx(otherMod))).status).toBe(404);
    expect(await prisma.studySelfTestAttempt.count({ where: { moduleId: otherMod } })).toBe(0);
  });

  it("la otra usuaria no ve mis intentos ni mis sesiones", async () => {
    await ms.POST(req("/api/study/micro-sessions", "POST", micro()), undefined as never);
    current = { id: other, role: "ATHLETE" };
    expect((await st.GET(req(`/api/study/self-test-history/${mod}`, "GET"), ctx(mod))).status).toBe(404);
    expect((await (await ms.GET(req("/api/study/micro-sessions", "GET"), undefined as never)).json()).sessions).toHaveLength(0);
    current = { id: me, role: "ATHLETE" };
    expect((await (await ms.GET(req("/api/study/micro-sessions", "GET"), undefined as never)).json()).sessions).toHaveLength(1);
  });

  it("micro-sesiones: idempotente por clientKey y distintas claves suman", async () => {
    await ms.POST(req("/api/study/micro-sessions", "POST", micro()), undefined as never);
    await ms.POST(req("/api/study/micro-sessions", "POST", micro({ clientKey: "k-2", completedAt: "2026-11-02T10:00:00.000Z", imported: true })), undefined as never);
    const j = await (await ms.GET(req("/api/study/micro-sessions", "GET"), undefined as never)).json();
    expect(j.sessions.map((s: { clientKey: string }) => s.clientKey)).toEqual(["k-2", "k-1"]);
    expect(j.sessions[1]).toMatchObject({ stepsDone: 1, stepsTotal: 1, focusMin: 15, restMin: 3 });
  });

  it("400 con datos fuera de rango", async () => {
    expect((await st.POST(req(`/api/study/self-test-history/${mod}`, "POST", { attempts: [attempt({ score: 11 })] }), ctx(mod))).status).toBe(400);
    expect((await st.POST(req(`/api/study/self-test-history/${mod}`, "POST", { attempts: [] }), ctx(mod))).status).toBe(400);
    expect((await ms.POST(req("/api/study/micro-sessions", "POST", micro({ stepsDone: 5 })), undefined as never)).status).toBe(400);
  });

  it("cascada: al borrar la asignatura y la usuaria desaparece el histórico", async () => {
    await prisma.studyModule.delete({ where: { id: mod } });
    expect(await prisma.studySelfTestAttempt.count({ where: { userId: me } })).toBe(0);
    await prisma.user.delete({ where: { id: me } });
    expect(await prisma.studyMicroSession.count({ where: { userId: me } })).toBe(0);
  });
});
