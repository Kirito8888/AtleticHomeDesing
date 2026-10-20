// Integración (seguridad · bloque 6): guardián de login, registro por API, 2FA, condiciones en escrituras y Origin.
import { randomUUID } from "node:crypto";

import { NextRequest } from "next/server";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({ user: null as null | { id: string; role: string } }));
vi.mock("@/auth", () => ({ auth: async () => (h.user ? { user: h.user } : null) }));

process.env.ALLOW_REGISTRATION = "true";
process.env.AUTH_URL = "http://app.test";
const HAS_DB = Boolean(process.env.DATABASE_URL);
const t = Date.now();
const req = (url: string, method: string, body?: unknown, headers: Record<string, string> = {}) =>
  new NextRequest(`http://app.test${url}`, { method, body: body === undefined ? undefined : JSON.stringify(body), headers: { "content-type": "application/json", "x-forwarded-for": `203.0.113.${(t % 200) + 1}`, ...headers } });

describe.skipIf(!HAS_DB)("endurecimiento de cuentas y API (BD real)", () => {
  let prisma: typeof import("@/lib/prisma").prisma;

  beforeAll(async () => {
    vi.resetModules();
    prisma = (await import("@/lib/prisma")).prisma;
  });
  afterAll(async () => {
    await prisma.user.deleteMany({ where: { email: { contains: `-${t}@test.dev` } } });
  });

  describe("inicio de sesión", () => {
    it("fallar desde varias IP no bloquea a una IP nueva ni a un dispositivo reconocido; sí cierra la IP que falla", async () => {
      const g = await import("./login-guard");
      const email = `victima-${t}@test.dev`;
      for (let i = 0; i < 5; i++) await g.recordLoginFailure(email, `198.51.100.${i + 1}`);
      // Antes del cambio, 5 fallos seguidos bloqueaban la cuenta para todos
      expect(await g.loginGate(email, "198.51.100.99", false)).toEqual({ blocked: false, delayMs: 2000 });
      expect((await g.loginGate(email, "198.51.100.1", false)).blocked).toBe(false); // 1 fallo en esa IP
      for (let i = 0; i < 4; i++) await g.recordLoginFailure(email, "198.51.100.1");
      expect((await g.loginGate(email, "198.51.100.1", true)).blocked).toBe(true); // 5 fallos en esa IP
    });

    it("tope global: bloquea a los dispositivos no reconocidos pero no a los reconocidos; el email inexistente se trata igual", async () => {
      const g = await import("./login-guard");
      for (const email of [`otra-${t}@test.dev`, `noexiste-${t}@test.dev`]) {
        for (let i = 0; i < 20; i++) await g.recordLoginFailure(email, `192.0.2.${i + 1}`);
        expect((await g.loginGate(email, "192.0.2.200", false)).blocked).toBe(true);
        expect((await g.loginGate(email, "192.0.2.200", true)).blocked).toBe(false);
        await g.clearGlobalFailures(email);
        expect((await g.loginGate(email, "192.0.2.200", false)).blocked).toBe(false);
      }
    });

    it("retraso progresivo con tope y cookie de dispositivo ligada a email y versión de sesión", async () => {
      const g = await import("./login-guard");
      expect([0, 3, 4, 5, 6, 7, 30].map(g.loginDelayMs)).toEqual([0, 0, 1000, 2000, 4000, 8000, 8000]);
      const tok = g.deviceToken("a@test.dev", 1);
      expect(g.isKnownDevice("a@test.dev", 1, tok)).toBe(true);
      expect(g.isKnownDevice("b@test.dev", 1, tok)).toBe(false);
      expect(g.isKnownDevice("a@test.dev", 2, tok)).toBe(false);
      expect(g.isKnownDevice("a@test.dev", 1, tok.slice(0, -1) + "x")).toBe(false);
      expect(g.isKnownDevice("a@test.dev", 1, undefined)).toBe(false);
    });
  });

  describe("registro por API", () => {
    it("ignora el rol, guarda las condiciones y responde igual si el email ya existe", async () => {
      const { POST } = await import("@/app/api/auth/register/route");
      const body = { name: "Nueva", email: `reg-${t}@test.dev`, password: "contraseña-larga-1", role: "COACH", terms: true };
      const first = await POST(req("/api/auth/register", "POST", body), undefined);
      const again = await POST(req("/api/auth/register", "POST", body), undefined);
      expect(first.status).toBe(202);
      expect(again.status).toBe(202);
      expect(await again.json()).toEqual(await first.json());
      const u = await prisma.user.findUniqueOrThrow({ where: { email: `reg-${t}@test.dev` }, include: { consents: true } });
      expect(u.role).toBe("ATHLETE");
      expect(u.consents.map((c) => c.purpose).sort()).toEqual(["PRIVACY", "TERMS"]);
      const noTerms = await POST(req("/api/auth/register", "POST", { ...body, email: `reg2-${t}@test.dev`, terms: undefined }), undefined);
      expect(noTerms.status).toBe(400);
      expect(await prisma.user.count({ where: { email: `reg2-${t}@test.dev` } })).toBe(0);
    });
  });

  describe("2FA: intentos por usuario", () => {
    it("el 6.º código erróneo seguido da 429", async () => {
      const u = await prisma.user.create({ data: { email: `tfa-${t}@test.dev`, passwordHash: "x" } });
      await prisma.consent.createMany({ data: [{ userId: u.id, purpose: "TERMS", version: (await import("./constants")).TERMS_VERSION, granted: true }] });
      h.user = { id: u.id, role: "ATHLETE" };
      const { PUT } = await import("@/app/api/account/2fa/route");
      const codes: number[] = [];
      for (let i = 0; i < 6; i++) codes.push((await PUT(req("/api/account/2fa", "PUT", { code: "000000" }), undefined)).status);
      expect(codes.slice(0, 5).every((c) => c !== 429)).toBe(true);
      expect(codes[5]).toBe(429);
    });
  });

  describe("condiciones y Origin en las escrituras", () => {
    it("sin condiciones aceptadas, escribir da 403; leer, no; y aceptar sí se puede", async () => {
      const u = await prisma.user.create({ data: { email: `sin-${t}@test.dev`, passwordHash: "x" } });
      h.user = { id: u.id, role: "ATHLETE" };
      const tasks = await import("@/app/api/tasks/route");
      const w = await tasks.POST(req("/api/tasks", "POST", { title: "x" }), undefined);
      expect(w.status).toBe(403);
      expect((await w.json()).details).toEqual({ code: "terms_required" });
      expect((await tasks.GET(req("/api/tasks", "GET"), undefined)).status).toBe(200);
      const terms = await import("@/app/api/account/terms/route");
      expect((await terms.POST(req("/api/account/terms", "POST"), undefined)).status).toBe(200);
      expect((await tasks.POST(req("/api/tasks", "POST", { title: "x" }), undefined)).status).toBeLessThan(300);
    });

    it("rechaza un Origin ajeno o cross-site; acepta el propio y la ausencia de cabeceras", async () => {
      const u = await prisma.user.create({ data: { email: `org-${t}@test.dev`, passwordHash: "x" } });
      await prisma.consent.create({ data: { userId: u.id, purpose: "TERMS", version: (await import("./constants")).TERMS_VERSION, granted: true } });
      h.user = { id: u.id, role: "ATHLETE" };
      const tasks = await import("@/app/api/tasks/route");
      const post = (headers: Record<string, string>) => tasks.POST(req("/api/tasks", "POST", { title: "y" }, headers), undefined);
      expect((await post({ origin: "http://otro.test" })).status).toBe(403);
      expect((await post({ "sec-fetch-site": "cross-site" })).status).toBe(403);
      expect((await post({ origin: "http://app.test" })).status).toBeLessThan(300);
      expect((await post({})).status).toBeLessThan(300);
    });
  });
});

describe.skipIf(!HAS_DB)("recuento deslizante", () => {
  it("los fallos repartidos a ambos lados del cambio de ventana siguen sumando", async () => {
    vi.resetModules();
    const { rateLimitPersistent, countPersistent } = await import("@/lib/rate-limit-db");
    const key = `slide-${t}-${randomUUID()}`;
    const win = 15 * 60_000;
    const edge = Math.ceil(Date.now() / win) * win; // próximo cambio de ventana
    for (let i = 0; i < 3; i++) await rateLimitPersistent(key, 99, win, edge - 5000 + i);
    for (let i = 0; i < 2; i++) await rateLimitPersistent(key, 99, win, edge + 1000 + i);
    expect(await countPersistent(key, win, edge + 2000)).toBeGreaterThanOrEqual(5);
    expect(await countPersistent(key, win, edge + win + 2000)).toBeLessThan(5); // dos ventanas después ya no
  });
});
