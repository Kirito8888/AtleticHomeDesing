// v3.0 R (V3-S09): tope por defecto de escrituras por usuaria dentro de `requireUser` (que `route()` envuelve).
import { NextRequest } from "next/server";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

let current: { id: string; role: "ATHLETE" } | null = null;
vi.mock("@/lib/auth/current", () => ({ currentSession: async () => (current ? { user: current } : null) }));
vi.mock("@/lib/rate-limit", async (orig) => {
  const m = await orig<typeof import("@/lib/rate-limit")>();
  return { ...m, LIMITS: { ...m.LIMITS, mutation: { limit: 3, windowMs: 60 * 60_000 } } };
});

const HAS_DB = Boolean(process.env.DATABASE_URL);
const ORIGIN = "http://localhost:3000";

const call = async (path: string, method: string) => {
  const { route } = await import("@/lib/api");
  const { requireUser } = await import("@/lib/auth/session");
  const handler = route(async () => {
    await requireUser();
    await requireUser(); // dos llamadas en la misma petición cuentan una sola vez
    return { ok: true };
  });
  const req = new NextRequest(new URL(path, ORIGIN), { method, headers: { origin: ORIGIN } });
  return handler(req, undefined as never);
};

describe("mutationLimitExempt", () => {
  it("solo exime derechos y configuración de acceso, no el resto", async () => {
    const { mutationLimitExempt } = await import("@/lib/request-context");
    for (const p of ["/api/account", "/api/account/export", "/api/account/privacy", "/api/account/2fa", "/api/passkeys/x"]) expect(mutationLimitExempt(p), p).toBe(true);
    for (const p of ["/api/training/sessions", "/api/finance/transactions/abc", "/api/account/ai-provider"]) expect(mutationLimitExempt(p), p).toBe(false);
  });
});

describe.skipIf(!HAS_DB)("límite de escrituras por usuaria (BD real)", () => {
  let prisma: typeof import("@/lib/prisma").prisma;
  let a: string;
  let b: string;
  beforeAll(async () => {
    process.env.AUTH_URL = ORIGIN;
    prisma = (await import("@/lib/prisma")).prisma;
    const mk = (n: string) => prisma.user.create({ data: { email: `mutlimit-${n}-${Date.now()}@test.invalid`, passwordHash: "x", role: "ATHLETE" }, select: { id: true } });
    [a, b] = (await Promise.all([mk("a"), mk("b")])).map((u) => u.id);
    for (const u of [a, b]) await prisma.consent.create({ data: { userId: u, purpose: "TERMS", version: (await import("@/lib/auth/constants")).TERMS_VERSION, granted: true } });
  });
  afterAll(async () => {
    await prisma.user.deleteMany({ where: { id: { in: [a, b] } } });
  });

  it("agota A (429 con Retry-After); B sigue; las lecturas y las exentas no cuentan", async () => {
    current = { id: a, role: "ATHLETE" };
    for (let i = 0; i < 3; i++) expect((await call("/api/x/1", "POST")).status).toBe(200);
    const blocked = await call("/api/x/1", "PATCH");
    expect(blocked.status).toBe(429);
    expect(Number(blocked.headers.get("Retry-After"))).toBeGreaterThan(0);
    expect((await call("/api/x/1", "GET")).status).toBe(200);
    expect((await call("/api/account/export", "POST")).status).toBe(200);
    current = { id: b, role: "ATHLETE" };
    expect((await call("/api/x/1", "DELETE")).status).toBe(200);
  });
});
