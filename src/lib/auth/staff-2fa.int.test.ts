import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { prisma } from "@/lib/prisma";

const hasDb = Boolean(process.env.DATABASE_URL);
let mockUser: { id: string; role: "COACH" | "ATHLETE" | "ADMIN" } | null = null;
vi.mock("@/lib/auth/current", () => ({ currentSession: async () => (mockUser ? { user: mockUser } : null) }));

describe.skipIf(!hasDb)("2FA obligatoria para ADMIN/COACH (V3-S01)", () => {
  const stamp = Date.now();
  let coachId = "";
  let athleteId = "";
  const old = process.env.STAFF_2FA_REQUIRED_FROM;

  beforeAll(async () => {
    const mk = (n: string, role: "COACH" | "ATHLETE") => prisma.user.create({ data: { email: `s2fa-${n}-${stamp}@test.invalid`, passwordHash: "x", role } });
    coachId = (await mk("c", "COACH")).id;
    athleteId = (await mk("a", "ATHLETE")).id;
  });
  afterAll(async () => {
    process.env.STAFF_2FA_REQUIRED_FROM = old;
    if (old === undefined) delete process.env.STAFF_2FA_REQUIRED_FROM;
    await prisma.user.deleteMany({ where: { id: { in: [coachId, athleteId] } } });
  });

  async function call(path: string, method = "GET") {
    const { requireUser } = await import("@/lib/auth/session");
    const { requestContext } = await import("@/lib/request-context");
    return requestContext.run({ method, path, reqId: "t" }, () => requireUser().then(() => 200, (e: { status?: number; details?: { code?: string } }) => `${e.status}:${e.details?.code ?? ""}`));
  }
  async function resetEnv(v?: string) {
    if (v) process.env.STAFF_2FA_REQUIRED_FROM = v;
    else delete process.env.STAFF_2FA_REQUIRED_FROM;
    vi.resetModules();
  }

  it("sin fecha de corte o con fecha futura no bloquea", async () => {
    mockUser = { id: coachId, role: "COACH" };
    await resetEnv();
    expect(await call("/api/coach/links")).toBe(200);
    await resetEnv("2999-01-01");
    expect(await call("/api/coach/links")).toBe(200);
  });

  it("pasada la fecha, la entrenadora sin 2FA recibe 403 second_factor (también en GET) salvo en las rutas de configuración", async () => {
    mockUser = { id: coachId, role: "COACH" };
    await resetEnv("2000-01-01");
    expect(await call("/api/coach/links")).toBe("403:second_factor");
    expect(await call("/api/account/2fa", "POST")).toMatch(/^(200|403:terms_required)$/);
    expect(await call("/api/account/passkeys", "POST")).toMatch(/^(200|403:terms_required)$/);
    expect(await call("/api/account/sessions", "DELETE")).toBe(200);
  });

  it("con TOTP o con llave de acceso pasa; las atletas nunca se bloquean", async () => {
    mockUser = { id: coachId, role: "COACH" };
    await resetEnv("2000-01-01");
    await prisma.user.update({ where: { id: coachId }, data: { totpEnabledAt: new Date() } });
    expect(await call("/api/coach/links")).toBe(200);
    await prisma.user.update({ where: { id: coachId }, data: { totpEnabledAt: null } });
    expect(await call("/api/coach/links")).toBe("403:second_factor");
    mockUser = { id: athleteId, role: "ATHLETE" };
    expect(await call("/api/training/sessions")).toBe(200);
  });
});
