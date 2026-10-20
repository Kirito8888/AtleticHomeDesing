// Seguridad (bloque 7): la auditoría. La IP y el navegador solo se guardan en la Actividad de la propia persona;
// lo que hace la administración sobre otra cuenta no deja su IP ahí. La cadena de hashes detecta manipulaciones.
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("@/auth", () => ({ auth: async () => null }));
vi.mock("@/lib/push/service", () => ({ sendToUser: vi.fn(async () => undefined) }));

const HAS_DB = Boolean(process.env.DATABASE_URL);
const ADMIN_IP = "198.51.100.7";
const ADMIN_UA = "Navegador-de-la-admin";

describe.skipIf(!HAS_DB)("auditoría (BD real)", () => {
  let prisma: typeof import("@/lib/prisma").prisma;
  let audit: typeof import("./audit");
  let access: typeof import("@/lib/auth/access");
  let admin: string;
  let target: string;
  const t = Date.now();
  const adminCtx = { ip: ADMIN_IP, userAgent: ADMIN_UA };
  const events = (userId: string) => prisma.securityEvent.findMany({ where: { userId }, orderBy: [{ createdAt: "asc" }, { id: "asc" }] });

  beforeAll(async () => {
    process.env.AUTH_SECRET = "secreto-de-auditoria-de-prueba-0123456789";
    vi.resetModules();
    prisma = (await import("@/lib/prisma")).prisma;
    audit = await import("./audit");
    access = await import("@/lib/auth/access");
    admin = (await prisma.user.create({ data: { email: `au-admin-${t}@test.dev`, name: "Admin", role: "ADMIN" } })).id;
    target = (await prisma.user.create({ data: { email: `au-target-${t}@test.dev`, name: "Persona" } })).id;
  });
  afterAll(async () => {
    await prisma.user.deleteMany({ where: { id: { in: [admin, target].filter(Boolean) } } });
  });

  it("auditContext: IP de la petición y navegador recortado a 300", () => {
    const ctx = audit.auditContext(new Headers({ "x-forwarded-for": "203.0.113.1, 203.0.113.2", "user-agent": "u".repeat(500) }));
    expect(ctx.ip).toBe("203.0.113.2");
    expect(ctx.userAgent).toHaveLength(300);
  });

  it("un evento propio guarda IP y navegador; sin IP o «unknown», null", async () => {
    await audit.recordEvent(target, "PASSWORD_CHANGED", { ip: "203.0.113.5", userAgent: "Mi-navegador" });
    await audit.recordEvent(target, "EMAIL_CHANGED", { ip: "unknown" });
    await audit.recordEvent(target, "DATA_EXPORTED");
    const rows = await events(target);
    expect(rows.map((r) => [r.type, r.ip, r.userAgent])).toEqual([
      ["PASSWORD_CHANGED", "203.0.113.5", "Mi-navegador"],
      ["EMAIL_CHANGED", null, null],
      ["DATA_EXPORTED", null, null],
    ]);
  });

  it("lo que hace la administración sobre otra cuenta NO guarda la IP ni el navegador de la administración", async () => {
    await access.suspendUser(admin, target);
    await access.reactivateUser(admin, target);
    await access.issuePasswordReset(admin, target);
    const mine = (await events(target)).filter((r) => ["ACCOUNT_SUSPENDED", "ACCOUNT_REACTIVATED", "PASSWORD_RESET_ISSUED"].includes(r.type));
    expect(mine).toHaveLength(3);
    for (const r of mine) expect([r.type, r.ip, r.userAgent]).toEqual([r.type, null, null]);
    // y lo que ve la persona en «Actividad reciente» tampoco la lleva
    expect(JSON.stringify(await audit.recentEvents(target))).not.toContain(ADMIN_IP);
    expect(JSON.stringify(await audit.recentEvents(target))).not.toContain(ADMIN_UA);
  });

  it("el cambio de rol o la expulsión de un club por la administración tampoco guarda la IP de quien lo hace", async () => {
    const clubs = await import("@/lib/clubs/service");
    const org = await prisma.organization.create({ data: { name: `Club-${t}` } });
    await prisma.orgMember.create({ data: { orgId: org.id, userId: admin, role: "ADMIN", status: "ACTIVE" } });
    const m = await prisma.orgMember.create({ data: { orgId: org.id, userId: target, role: "ATHLETE", status: "ACTIVE" } });
    try {
      await clubs.removeMember({ id: admin, role: "ADMIN" }, org.id, m.id, adminCtx);
      const rows = (await events(target)).filter((r) => r.type === "COACH_SCOPES_CHANGED");
      expect(rows).toHaveLength(1);
      expect([rows[0].ip, rows[0].userAgent]).toEqual([null, null]);
    } finally {
      await prisma.organization.delete({ where: { id: org.id } });
    }
  });

  it("la cadena es íntegra, y detecta que se cambie un evento o se borre uno", async () => {
    expect(await audit.auditIntegrity(target)).toMatchObject({ ok: true });
    const rows = await events(target);
    expect(rows.every((r) => r.hash)).toBe(true);
    expect(rows[1].prevHash).toBe(rows[0].hash);
    await prisma.securityEvent.update({ where: { id: rows[0].id }, data: { ip: "10.9.9.9" } });
    expect(await audit.auditIntegrity(target)).toMatchObject({ ok: false });
    await prisma.securityEvent.update({ where: { id: rows[0].id }, data: { ip: rows[0].ip } });
    expect(await audit.auditIntegrity(target)).toMatchObject({ ok: true });
    await prisma.securityEvent.delete({ where: { id: rows[1].id } });
    expect(await audit.auditIntegrity(target)).toMatchObject({ ok: false });
  });

  it("recordEvent nunca rompe la operación que lo origina", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    await expect(audit.recordEvent("usuario-que-no-existe", "PASSWORD_CHANGED", { ip: "203.0.113.5" })).resolves.toBeUndefined();
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });
});
