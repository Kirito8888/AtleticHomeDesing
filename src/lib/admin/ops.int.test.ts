// Integración con BD real (v1.8): límite persistente, errores agregados, uso local, administración con
// segundo factor, integridad y aviso de copias.
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

let current: { id: string; role: string } | null = null;
vi.mock("@/auth", () => ({ auth: async () => (current ? { user: { id: current.id, role: current.role, sv: 1 } } : null) }));

const HAS_DB = Boolean(process.env.DATABASE_URL);

describe.skipIf(!HAS_DB)("operación v1.8 (BD real)", () => {
  let prisma: typeof import("@/lib/prisma").prisma;
  let userId: string;
  let adminId: string;
  let dir: string;
  const saved = { ...process.env };

  beforeAll(async () => {
    dir = await mkdtemp(path.join(tmpdir(), "lifeos-ops-"));
    process.env.UPLOAD_DIR = dir;
    vi.resetModules();
    prisma = (await import("@/lib/prisma")).prisma;
    const t = Date.now();
    userId = (await prisma.user.create({ data: { email: `ops1-${t}@test.dev`, athleteProfile: { create: {} } } })).id;
    adminId = (await prisma.user.create({ data: { email: `ops2-${t}@test.dev`, role: "ADMIN" } })).id;
  });
  afterAll(async () => {
    process.env = saved;
    await prisma.user.deleteMany({ where: { id: { in: [userId, adminId] } } });
    await rm(dir, { recursive: true, force: true });
  });

  it("límite persistente: cuenta en la BD (sobrevive a un reinicio) y libera la ventana siguiente", async () => {
    const { rateLimitPersistent } = await import("@/lib/rate-limit-db");
    const key = `test:${Date.now()}`;
    const t0 = Date.UTC(2026, 9, 10, 10, 0, 0);
    for (let i = 0; i < 3; i++) expect((await rateLimitPersistent(key, 3, 60_000, t0 + i)).ok).toBe(true);
    vi.resetModules(); // como si la web se reiniciara: la memoria se pierde, la BD no
    const again = await import("@/lib/rate-limit-db");
    const blocked = await again.rateLimitPersistent(key, 3, 60_000, t0 + 10);
    expect(blocked).toMatchObject({ ok: false });
    expect(blocked.retryAfterSec).toBeGreaterThan(0);
    expect((await again.rateLimitPersistent(key, 3, 60_000, t0 + 61_000)).ok).toBe(true);
    await prisma.rateLimitHit.deleteMany({ where: { key } });
  });

  it("errores agregados por ruta y mensaje", async () => {
    const { recordServerError } = await import("./server-errors");
    await recordServerError("ERROR", "/api/x/clx9a8b7c6d5e4f3g2h1i0j9k", "TypeError: boom");
    await recordServerError("ERROR", "/api/x/clz9a8b7c6d5e4f3g2h1i0j9k", "TypeError: boom");
    const e = await prisma.serverError.findFirstOrThrow({ where: { path: "/api/x/[id]", message: "TypeError: boom" } });
    expect(e.count).toBe(2);
    await prisma.serverError.delete({ where: { id: e.id } });
  });

  it("uso local: suma por patrón y respeta la preferencia", async () => {
    const usage = await import("./usage");
    await usage.recordPageView(userId, "/training/clx9a8b7c6d5e4f3g2h1i0j9k");
    await usage.recordPageView(userId, "/training/clz9a8b7c6d5e4f3g2h1i0j9k");
    const s = await usage.usageSummary(userId);
    expect(s.top).toEqual([{ path: "/training/[id]", count: 2 }]);
    expect(s.unused).toContain("/finance");
    const { updatePrefs } = await import("@/lib/rules/prefs-service");
    await updatePrefs(userId, { usageStats: false });
    await usage.recordPageView(userId, "/finance");
    expect((await usage.usageSummary(userId)).top.some((r) => r.path === "/finance")).toBe(false);
  });

  it("administración: sin segundo factor, 403; con 2FA, entra", async () => {
    const { requireAdmin } = await import("@/lib/auth/admin");
    current = { id: adminId, role: "ADMIN" };
    await expect(requireAdmin()).rejects.toThrow(/verificación en dos pasos/);
    await prisma.user.update({ where: { id: adminId }, data: { totpSecret: "x", totpEnabledAt: new Date() } });
    await expect(requireAdmin()).resolves.toMatchObject({ id: adminId });
    current = { id: userId, role: "ATHLETE" };
    await expect(requireAdmin()).rejects.toThrow(/Solo para administración/);
    current = null;
  });

  it("integridad: detecta ficheros sin registro y registros sin fichero", async () => {
    const { checkIntegrity } = await import("./ops");
    const injury = await prisma.injury.create({ data: { userId, area: "KNEE", pain: 2, startedOn: new Date("2026-10-01") } });
    await prisma.injuryPhoto.create({ data: { userId, injuryId: injury.id, path: "photos/falta.jpg.enc", mime: "image/jpeg", takenOn: new Date("2026-10-01") } });
    await mkdir(path.join(dir, userId, "receipts"), { recursive: true });
    await writeFile(path.join(dir, userId, "receipts", "huerfano.pdf.enc"), "x");
    const r = await checkIntegrity();
    expect(r.missingFiles).toBeGreaterThanOrEqual(1);
    expect(r.orphanFiles).toBeGreaterThanOrEqual(1);
    expect(r.ok).toBe(false);
  });

  it("copias: avisa si la última falló o es vieja", async () => {
    const { backupAlert } = await import("./ops");
    const now = new Date("2030-01-10T12:00:00Z");
    const ok = await prisma.backupRun.create({ data: { ok: true, detail: "test", at: new Date("2030-01-10T03:30:00Z") } });
    expect(await backupAlert(now)).toBeNull();
    expect(await backupAlert(new Date("2030-01-12T12:00:00Z"))).toMatch(/36 horas/);
    const bad = await prisma.backupRun.create({ data: { ok: false, detail: "disco lleno", at: new Date("2030-01-10T04:00:00Z") } });
    expect(await backupAlert(now)).toMatch(/falló \(disco lleno\)/);
    await prisma.backupRun.deleteMany({ where: { id: { in: [ok.id, bad.id] } } });
  });
});
